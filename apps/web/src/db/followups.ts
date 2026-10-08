import type { Pool, PoolClient } from "pg";
import type { MutationResult, MutationContext } from "../core/memory";
import { requireSafePersistence } from "../core/memory";
import {
  followupInput,
  validateSchedule,
  validTimezone,
  type FollowupInput,
  type Followup,
} from "../core/followups";
import { RequestError } from "../core/validation";
import { mutate, missing, stale } from "./record-mutations";
import { recordBehavior, type Behavior } from "./events";
import { DeletionJournal } from "../privacy/journal";
const projection = `f.id,f.reason,f.related_item_id AS "relatedItemId",i.content AS "relatedTitle",CASE WHEN i.record_role='object' THEN i.id ELSE i.parent_id END AS "relatedObjectId",f.scheduled_for AS "scheduledFor",f.timezone,f.status,f.delivery_status AS "deliveryStatus",f.version,f.opened_at AS "openedAt",f.delivered_at AS "deliveredAt",f.created_at AS "createdAt",f.lifecycle_source AS "lifecycleSource",f.lifecycle_changed_at AS "lifecycleChangedAt"`;
export type FollowupAction =
  "reschedule" | "done" | "dismiss" | "cancel" | "open";
export class PostgresFollowups {
  constructor(private pool: Pool) {}
  async context(owner: string) {
    const row = (
      await this.pool.query('SELECT timezone FROM "user" WHERE id=$1', [owner])
    ).rows[0];
    const now = new Date();
    return {
      timezone: row?.timezone ?? null,
      now: now.toISOString(),
      recent: await this.list(owner),
    };
  }
  async configureTimezone(owner: string, zone: string) {
    if (!validTimezone(zone))
      throw new RequestError(400, "timezone", "Choose an IANA timezone.");
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        owner,
      ]);
      if (
        !(
          await c.query(
            'UPDATE "user" SET timezone=$2 WHERE id=$1 AND NOT processing_paused RETURNING id',
            [owner, zone],
          )
        ).rowCount
      )
        throw new RequestError(
          403,
          "paused",
          "Resume Sahaay before changing timezone.",
        );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async list(owner: string, relatedItemId?: string | null) {
    const result = await this.pool.query(
      `SELECT ${projection} FROM followups f LEFT JOIN saved_items i ON i.id=f.related_item_id AND i.user_id=f.user_id WHERE f.user_id=$1 AND ($2::uuid IS NULL OR f.related_item_id=$2 OR i.parent_id=$2) ORDER BY CASE WHEN f.status='ready' THEN 0 WHEN f.status='scheduled' THEN 1 ELSE 2 END,f.scheduled_for ASC LIMIT 200`,
      [owner, relatedItemId ?? null],
    );
    return JSON.parse(JSON.stringify(result.rows)) as Followup[];
  }
  private async get(c: Pool | PoolClient, owner: string, id: string) {
    const row = (
      await c.query(
        `SELECT ${projection} FROM followups f LEFT JOIN saved_items i ON i.id=f.related_item_id AND i.user_id=f.user_id WHERE f.id=$1 AND f.user_id=$2`,
        [id, owner],
      )
    ).rows[0];
    return row ? (JSON.parse(JSON.stringify(row)) as Followup) : null;
  }
  private async replay(
    c: PoolClient,
    owner: string,
    id: string,
  ): Promise<MutationResult<Followup>> {
    const record = await this.get(c, owner, id);
    return {
      outcome: record ? ("replayed" as const) : ("deleted" as const),
      record,
      targetId: id,
    };
  }
  async create(ctx: MutationContext, input: FollowupInput) {
    const v = followupInput.parse(input);
    requireSafePersistence(v);
    const owner = ctx.request.userId;
    const related = v.relatedItemId
      ? (
          await this.pool.query(
            "SELECT id,content,version,status FROM saved_items WHERE id=$1 AND user_id=$2",
            [v.relatedItemId, owner],
          )
        ).rows[0]
      : null;

    const timezone = (await this.context(owner)).timezone;
    return mutate<MutationResult<Followup>>(
      this.pool,
      ctx,
      "followup_create",
      (c, id) => this.replay(c, owner, id),
      async (c) => {
        validateSchedule(v);
        const configured =
          (await c.query('SELECT timezone FROM "user" WHERE id=$1', [owner]))
            .rows[0]?.timezone ?? null;
        if (configured !== timezone) stale();
        if (v.relatedItemId && (!related || related.status === "archived"))
          missing();
        if (
          (
            await c.query(
              "SELECT count(*)::int n FROM followups WHERE user_id=$1 AND status IN ('scheduled','ready')",
              [owner],
            )
          ).rows[0].n >= 200
        )
          throw new RequestError(
            429,
            "followup_limit",
            "Finish or cancel older follow-ups first.",
          );
        if (
          related &&
          !(
            await c.query(
              "SELECT 1 FROM saved_items WHERE id=$1 AND user_id=$2 AND version=$3 AND status<>'archived'",
              [related.id, owner, related.version],
            )
          ).rowCount
        )
          stale();
        const id = (
          await c.query(
            "INSERT INTO followups(user_id,related_item_id,reason,scheduled_for,timezone,source_id,conversation_id,lifecycle_source,lifecycle_changed_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()) RETURNING id",
            [
              owner,
              v.relatedItemId,
              v.reason,
              v.scheduledFor,
              v.timezone,
              ctx.request.messageId,
              ctx.request.conversationId,
              ctx.request.channel === "telegram" ? "chat_telegram" : "chat_web",
            ],
          )
        ).rows[0].id;
        await recordBehavior(
          c,
          owner,
          ctx.request.requestId,
          "followup_created",
        );
        return {
          receipt: { targetId: id, version: 1, suppressedSourceIds: [] },
          value: {
            outcome: "committed" as const,
            record: (await this.get(c, owner, id))!,
            targetId: id,
          },
        };
      },
      {
        input: v,
        related,
        configuredTimezone: timezone,
        now: ctx.request.receivedAt,
      },
    );
  }
  async change(
    ctx: MutationContext,
    id: string,
    version: number,
    action: Exclude<FollowupAction, "dismiss" | "open">,
    input?: FollowupInput,
  ) {
    if (action !== "reschedule" && input)
      throw new RequestError(
        400,
        "schedule",
        "Only rescheduling accepts a new time.",
      );
    const owner = ctx.request.userId,
      current = await this.get(this.pool, owner, id);
    if (input) {
      followupInput.parse(input);
      requireSafePersistence(input);
    }
    return mutate<MutationResult<Followup>>(
      this.pool,
      ctx,
      action === "reschedule"
        ? "followup_update"
        : action === "done"
          ? "followup_done"
          : "followup_cancel",
      (c, target) => this.replay(c, owner, target),
      async (c) => {
        const record = await this.write(
          c,
          owner,
          id,
          version,
          action,
          input,
          ctx.request.channel === "telegram" ? "chat_telegram" : "chat_web",
        );
        await recordBehavior(
          c,
          owner,
          ctx.request.requestId,
          this.event(action),
        );
        return {
          receipt: {
            targetId: id,
            version: record.version,
            suppressedSourceIds: [],
          },
          value: { outcome: "committed" as const, record, targetId: id },
        };
      },
      { current, input, action, now: ctx.request.receivedAt },
    );
  }
  private event(action: FollowupAction): Behavior {
    return (
      {
        reschedule: "followup_rescheduled",
        done: "followup_completed",
        dismiss: "followup_dismissed",
        cancel: "followup_cancelled",
        open: "followup_opened",
      } as const
    )[action];
  }
  private async write(
    c: PoolClient,
    owner: string,
    id: string,
    version: number,
    action: FollowupAction,
    input: FollowupInput | undefined,
    source: "chat_web" | "chat_telegram" | "web_inbox",
  ) {
    const old = await this.get(c, owner, id);
    if (!old) missing();
    if (old.version !== version) stale();
    if (!["scheduled", "ready"].includes(old.status))
      throw new RequestError(
        409,
        "closed_followup",
        "This follow-up is already closed.",
      );
    if (action === "reschedule" && !input)
      throw new RequestError(400, "schedule", "Choose the new date and time.");
    if (input) {
      validateSchedule(input);
      if (
        input.relatedItemId !== old.relatedItemId ||
        input.reason !== old.reason
      )
        throw new RequestError(
          400,
          "followup_target",
          "Rescheduling preserves the reason and related item.",
        );
    }
    if (action === "open" && old.openedAt) return old;
    if (action !== "open")
      await new DeletionJournal().append({
        kind: "followup",
        userId: owner,
        ids: [id],
        sourceIds: [],
        keepVersion: old.version + 1,
      });
    const status =
      action === "done"
        ? "completed"
        : action === "dismiss"
          ? "dismissed"
          : action === "cancel"
            ? "cancelled"
            : action === "reschedule"
              ? "scheduled"
              : old.status;
    const field = (
      {
        done: "completed_at",
        dismiss: "dismissed_at",
        cancel: "cancelled_at",
        open: "opened_at",
        reschedule: "updated_at",
      } as const
    )[action];
    await c.query(
      `UPDATE followups SET status=$3,${field}=now()${field === "updated_at" ? "" : ",updated_at=now()"},version=${action === "open" ? "version" : "version+1"}${input ? ",scheduled_for=$4,timezone=$5,delivery_status='pending',attempt_id=NULL,attempts=0,retry_at=NULL,triggered_at=NULL,delivered_at=NULL,telegram_message_id=NULL,opened_at=NULL" : ""} WHERE id=$1 AND user_id=$2`,
      input
        ? [id, owner, status, input.scheduledFor, input.timezone]
        : [id, owner, status],
    );
    if (action !== "open")
      await c.query(
        "UPDATE followups SET lifecycle_source=$3,lifecycle_changed_at=now() WHERE id=$1 AND user_id=$2",
        [id, owner, source],
      );
    return (await this.get(c, owner, id))!;
  }
  async webChange(
    owner: string,
    id: string,
    version: number,
    action: FollowupAction,
    input?: FollowupInput,
    confirmed = false,
  ) {
    if ((action === "cancel" || action === "dismiss") && !confirmed)
      throw new RequestError(
        400,
        "confirmation_required",
        "Confirm stopping this reminder before changing it.",
      );
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        owner,
      ]);
      if (
        action === "reschedule" &&
        !(
          await c.query(
            'SELECT 1 FROM "user" WHERE id=$1 AND NOT processing_paused',
            [owner],
          )
        ).rowCount
      )
        throw new RequestError(
          403,
          "paused",
          "Resume Sahaay before rescheduling.",
        );
      const record = await this.write(
        c,
        owner,
        id,
        version,
        action,
        input,
        "web_inbox",
      );
      const requestId = crypto.randomUUID();
      await recordBehavior(c, owner, requestId, this.event(action));
      if (action === "open")
        await recordBehavior(c, owner, requestId, "inbox_item_opened");
      await c.query("COMMIT");
      return record;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
}
