import type { Pool, PoolClient } from "pg";
import { recordBehavior } from "../db/events";
export type DeliveryResult =
  | { status: "delivered"; messageId: number }
  | { status: "retry"; after: number }
  | { status: "unknown" | "failed" };
export type FollowupNotifier = (
  chatId: number,
  text: string,
) => Promise<DeliveryResult>;
// Persistence, lifecycle and authorization are shared. A notifier only sends text.
export class FollowupWorker {
  constructor(
    private pool: Pool,
    private notify: FollowupNotifier | null,
    private requireVerified = false,
  ) {}
  async tick(now = new Date()) {
    const ids = (
      await this.pool.query(
        `SELECT f.id,f.user_id FROM followups f JOIN "user" u ON u.id=f.user_id WHERE NOT u.processing_paused AND (NOT $2 OR u.email_verified) AND ((f.status='scheduled' AND f.scheduled_for<=$1) OR (f.status='ready' AND ((f.delivery_status='pending' AND $3 AND EXISTS(SELECT 1 FROM telegram_links l WHERE l.user_id=f.user_id) AND (f.retry_at IS NULL OR f.retry_at<=$1)) OR (f.delivery_status='sending' AND f.updated_at<now()-interval '3 minutes')))) ORDER BY f.scheduled_for LIMIT 200`,
        [now, this.requireVerified, Boolean(this.notify)],
      )
    ).rows;
    // Bounded batch; all operations serialize against privacy changes and user mutations.
    for (const row of ids) {
      try {
        await this.process(row.id, row.user_id, now);
      } catch {
        console.error("Follow-up processing unavailable");
      }
    }
    await this.pool.query(
      "DELETE FROM followups WHERE status IN ('completed','dismissed','cancelled') AND updated_at<now()-interval '30 days'",
    );
  }
  private async transaction<T>(
    owner: string,
    run: (c: PoolClient) => Promise<T>,
  ) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        owner,
      ]);
      const value = await run(c);
      await c.query("COMMIT");
      return value;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  private async process(id: string, owner: string, now: Date) {
    const attempt = await this.transaction(owner, async (c) => {
      const f = (
        await c.query(
          `SELECT f.*,u.processing_paused,u.email_verified,l.telegram_user_id FROM followups f JOIN "user" u ON u.id=f.user_id LEFT JOIN telegram_links l ON l.user_id=f.user_id WHERE f.id=$1 AND f.user_id=$2 FOR UPDATE OF f`,
          [id, owner],
        )
      ).rows[0];
      if (
        !f ||
        f.processing_paused ||
        (this.requireVerified && !f.email_verified) ||
        !["scheduled", "ready"].includes(f.status)
      )
        return null;
      if (f.status === "scheduled") {
        if (new Date(f.scheduled_for) > now) return null;
        await c.query(
          "UPDATE followups SET status='ready',triggered_at=$2,updated_at=now(),lifecycle_source='due_worker',lifecycle_changed_at=now() WHERE id=$1",
          [id, now],
        );
        await recordBehavior(
          c,
          owner,
          crypto.randomUUID(),
          "followup_triggered",
        );
      }
      if (f.delivery_status === "sending") {
        if (Date.now() - new Date(f.updated_at).getTime() > 180000)
          await c.query(
            "UPDATE followups SET delivery_status='unknown',updated_at=now() WHERE id=$1",
            [id],
          );
        return null;
      }
      if (
        !this.notify ||
        !f.telegram_user_id ||
        f.delivery_status !== "pending" ||
        (f.retry_at && new Date(f.retry_at) > now)
      )
        return null;
      const attemptId = crypto.randomUUID();
      await c.query(
        "UPDATE followups SET delivery_status='sending',attempt_id=$2,attempts=attempts+1,updated_at=now() WHERE id=$1",
        [id, attemptId],
      );
      return { id: attemptId, chatId: f.telegram_user_id, version: f.version };
    });
    if (!attempt) return;
    // The send intent above is COMMITTED before network I/O. A crash cannot roll it
    // back to pending. Recheck consent under the same lock used by cancel/delete.
    await this.transaction(owner, async (c) => {
      const f = (
        await c.query(
          `SELECT f.*,u.processing_paused,u.email_verified,l.telegram_user_id,i.content AS related_title FROM followups f JOIN "user" u ON u.id=f.user_id LEFT JOIN telegram_links l ON l.user_id=f.user_id LEFT JOIN saved_items i ON i.id=f.related_item_id AND i.user_id=f.user_id WHERE f.id=$1 AND f.user_id=$2`,
          [id, owner],
        )
      ).rows[0];
      if (
        !f ||
        f.attempt_id !== attempt.id ||
        f.version !== attempt.version ||
        f.status !== "ready" ||
        f.delivery_status !== "sending"
      )
        return;
      if (
        f.processing_paused ||
        (this.requireVerified && !f.email_verified) ||
        f.telegram_user_id !== attempt.chatId
      ) {
        await c.query(
          "UPDATE followups SET delivery_status='pending',attempt_id=NULL,updated_at=now() WHERE id=$1",
          [id],
        );
        return;
      }
      const text = `${f.related_title ? f.related_title + "\n\n" : ""}You asked me to remind you:\n${f.reason}\n\nYou can ask me to mark this done, cancel it or reschedule it.`;
      let result: DeliveryResult;
      try {
        result = await this.notify!(Number(attempt.chatId), text);
      } catch {
        result = { status: "unknown" };
      }
      if (result.status === "delivered") {
        await c.query(
          "UPDATE followups SET delivery_status='delivered',delivered_at=$2,telegram_message_id=$3,updated_at=now() WHERE id=$1",
          [id, now, result.messageId],
        );
        await recordBehavior(
          c,
          owner,
          crypto.randomUUID(),
          "followup_delivered",
        );
      } else if (result.status === "retry" && f.attempts < 3) {
        await c.query(
          "UPDATE followups SET delivery_status='pending',retry_at=$2,attempt_id=NULL,updated_at=now() WHERE id=$1",
          [
            id,
            new Date(
              now.getTime() + Math.max(30, Math.min(result.after, 300)) * 1000,
            ),
          ],
        );
      } else
        await c.query(
          "UPDATE followups SET delivery_status=$2,updated_at=now() WHERE id=$1",
          [id, result.status === "retry" ? "failed" : result.status],
        );
    });
  }
}
