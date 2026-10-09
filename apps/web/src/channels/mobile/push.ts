import { z } from "zod";
import type { Pool, PoolClient } from "pg";
const ticket = z.object({
  data: z.object({
    status: z.enum(["ok", "error"]),
    id: z.string().optional(),
    details: z.object({ error: z.string().optional() }).optional(),
  }),
});
export type PushResult =
  | { status: "accepted"; ticketId: string }
  | { status: "retry" }
  | { status: "unknown" | "failed" | "invalid" };
export interface PushTransport {
  send(token: string, followupId: string): Promise<PushResult>;
  receipts(
    ids: string[],
  ): Promise<Record<string, "delivered" | "failed" | "invalid">>;
}
export class ExpoPushTransport implements PushTransport {
  constructor(private accessToken?: string) {}
  private async post(path: string, body: unknown) {
    return fetch("https://exp.host/--/api/v2/push/" + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(this.accessToken
          ? { Authorization: "Bearer " + this.accessToken }
          : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  }
  async send(token: string, followupId: string): Promise<PushResult> {
    try {
      const r = await this.post("send", {
        to: token,
        title: "Sahaay",
        body: "A follow-up is ready in your Inbox.",
        data: { followupId },
        sound: "default",
        channelId: "followups",
      });
      if (r.status === 429) return { status: "retry" };
      if (!r.ok) return { status: r.status >= 500 ? "unknown" : "failed" };
      const parsed = ticket.safeParse(await r.json());
      if (!parsed.success) return { status: "unknown" };
      const t = parsed.data.data;
      if (t.status === "ok" && t.id)
        return { status: "accepted", ticketId: t.id };
      return {
        status:
          t.details?.error === "DeviceNotRegistered" ? "invalid" : "failed",
      };
    } catch {
      return { status: "unknown" };
    }
  }
  async receipts(ids: string[]) {
    try {
      const r = await this.post("getReceipts", { ids });
      if (!r.ok) return {};
      const parsed = z
        .object({
          data: z.record(
            z.string(),
            z.object({
              status: z.enum(["ok", "error"]),
              details: z.object({ error: z.string().optional() }).optional(),
            }),
          ),
        })
        .safeParse(await r.json());
      if (!parsed.success) return {};
      return Object.fromEntries(
        Object.entries(parsed.data.data).map(([id, r]) => [
          id,
          r.status === "ok"
            ? "delivered"
            : r.details?.error === "DeviceNotRegistered"
              ? "invalid"
              : "failed",
        ]),
      ) as Record<string, "delivered" | "failed" | "invalid">;
    } catch {
      return {};
    }
  }
}
// Called by the existing M7 tick. It consumes readiness and never schedules work.
export class MobilePushDelivery {
  constructor(
    private pool: Pool,
    private transport: PushTransport,
    private verified = true,
  ) {}
  private async locked<T>(owner: string, fn: (c: PoolClient) => Promise<T>) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        owner,
      ]);
      const result = await fn(c);
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async tick() {
    await this.pool.query(
      `INSERT INTO mobile_push_deliveries(user_id,followup_id,followup_version,device_id,device_revision) SELECT f.user_id,f.id,f.version,d.id,d.revision FROM followups f JOIN mobile_devices d ON d.user_id=f.user_id JOIN "user" u ON u.id=f.user_id WHERE f.status='ready' AND d.enabled AND d.created_at<=f.triggered_at AND NOT u.processing_paused AND (NOT $1 OR u.email_verified) AND NOT EXISTS(SELECT 1 FROM mobile_push_deliveries p WHERE p.followup_id=f.id AND p.followup_version=f.version AND p.device_id=d.id) ORDER BY f.triggered_at,f.id LIMIT 100 ON CONFLICT DO NOTHING`,
      [this.verified],
    );
    await this.pool.query(
      `UPDATE mobile_push_deliveries SET status='unknown',updated_at=now() WHERE status='sending' AND updated_at<now()-interval '3 minutes'`,
    );
    const rows = (
      await this.pool.query(
        `SELECT p.id,p.user_id FROM mobile_push_deliveries p JOIN "user" u ON u.id=p.user_id WHERE p.status='pending' AND (p.retry_at IS NULL OR p.retry_at<=now()) AND NOT u.processing_paused AND (NOT $1 OR u.email_verified) ORDER BY p.created_at LIMIT 20`,
        [this.verified],
      )
    ).rows;
    for (const row of rows) await this.deliver(row.id, row.user_id);
    await this.checkReceipts();
    await this.pool.query(
      `DELETE FROM mobile_push_deliveries p WHERE status IN ('accepted','delivered','unknown','failed','cancelled') AND updated_at<now()-interval '30 days' AND NOT EXISTS(SELECT 1 FROM followups f WHERE f.id=p.followup_id AND f.version=p.followup_version AND f.status='ready')`,
    );
  }
  private async row(c: PoolClient, id: string, owner: string) {
    return (
      await c.query(
        `SELECT p.*,f.status AS reminder_status,f.version AS current_version,d.enabled,d.expo_token,d.revision AS current_revision,u.processing_paused,u.email_verified FROM mobile_push_deliveries p JOIN followups f ON f.id=p.followup_id AND f.user_id=p.user_id JOIN mobile_devices d ON d.id=p.device_id AND d.user_id=p.user_id JOIN "user" u ON u.id=p.user_id WHERE p.id=$1 AND p.user_id=$2 FOR UPDATE OF p`,
        [id, owner],
      )
    ).rows[0];
  }
  private eligible(row: Record<string, unknown>) {
    return (
      row.reminder_status === "ready" &&
      row.followup_version === row.current_version &&
      row.device_revision === row.current_revision &&
      row.enabled &&
      !row.processing_paused &&
      (!this.verified || row.email_verified)
    );
  }
  private async deliver(id: string, owner: string) {
    const attempt = await this.locked(owner, async (c) => {
      const row = await this.row(c, id, owner);
      if (!row || row.status !== "pending") return null;
      if (row.processing_paused || (this.verified && !row.email_verified))
        return null;
      if (!this.eligible(row)) {
        await c.query(
          "UPDATE mobile_push_deliveries SET status='cancelled',updated_at=now() WHERE id=$1",
          [id],
        );
        return null;
      }
      const attempt = crypto.randomUUID();
      await c.query(
        "UPDATE mobile_push_deliveries SET status='sending',attempt_id=$2,attempts=attempts+1,updated_at=now() WHERE id=$1",
        [id, attempt],
      );
      return attempt;
    });
    if (!attempt) return;
    // Commit before I/O, then recheck under the shared privacy/cancel lock.
    await this.locked(owner, async (c) => {
      const row = await this.row(c, id, owner);
      if (!row || row.status !== "sending" || row.attempt_id !== attempt)
        return;
      if (row.processing_paused || (this.verified && !row.email_verified)) {
        await c.query(
          "UPDATE mobile_push_deliveries SET status='pending',attempt_id=NULL,updated_at=now() WHERE id=$1",
          [id],
        );
        return;
      }
      if (!this.eligible(row)) {
        await c.query(
          "UPDATE mobile_push_deliveries SET status='cancelled',updated_at=now() WHERE id=$1",
          [id],
        );
        return;
      }
      let result: PushResult;
      try {
        result = await this.transport.send(row.expo_token, row.followup_id);
      } catch {
        result = { status: "unknown" };
      }
      if (result.status === "accepted")
        await c.query(
          "UPDATE mobile_push_deliveries SET status='accepted',ticket_id=$2,accepted_at=now(),updated_at=now() WHERE id=$1",
          [id, result.ticketId],
        );
      else if (result.status === "retry" && row.attempts < 3)
        await c.query(
          "UPDATE mobile_push_deliveries SET status='pending',retry_at=now()+interval '60 seconds',updated_at=now() WHERE id=$1",
          [id],
        );
      else {
        await c.query(
          "UPDATE mobile_push_deliveries SET status=$2,updated_at=now() WHERE id=$1",
          [id, result.status === "unknown" ? "unknown" : "failed"],
        );
        if (result.status === "invalid")
          await c.query(
            "UPDATE mobile_devices SET enabled=false WHERE id=$1 AND user_id=$2 AND revision=$3",
            [row.device_id, owner, row.device_revision],
          );
      }
    });
  }
  private async checkReceipts() {
    const rows = (
      await this.pool.query(
        `SELECT id,user_id,device_id,device_revision,ticket_id FROM mobile_push_deliveries WHERE status='accepted' AND accepted_at<now()-interval '15 minutes' AND (receipt_checked_at IS NULL OR receipt_checked_at<now()-interval '15 minutes') ORDER BY receipt_checked_at NULLS FIRST,accepted_at LIMIT 50`,
      )
    ).rows;
    if (!rows.length) return;
    const receipts = await this.transport.receipts(
      rows.map((r) => r.ticket_id),
    );
    for (const row of rows) {
      const result = receipts[row.ticket_id];
      if (!result) {
        await this.pool.query(
          "UPDATE mobile_push_deliveries SET receipt_checked_at=now() WHERE id=$1 AND status='accepted'",
          [row.id],
        );
        continue;
      }
      await this.locked(row.user_id, async (c) => {
        await c.query(
          "UPDATE mobile_push_deliveries SET status=$2,updated_at=now() WHERE id=$1 AND status='accepted'",
          [row.id, result === "delivered" ? "delivered" : "failed"],
        );
        if (result === "invalid")
          await c.query(
            "UPDATE mobile_devices SET enabled=false WHERE id=$1 AND user_id=$2 AND revision=$3",
            [row.device_id, row.user_id, row.device_revision],
          );
      });
    }
    await this.pool.query(
      "UPDATE mobile_push_deliveries SET status='unknown',updated_at=now() WHERE status='accepted' AND accepted_at<now()-interval '24 hours'",
    );
  }
}
