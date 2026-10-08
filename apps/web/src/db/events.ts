import type { Pool, PoolClient } from "pg";
import type { UnifiedRequest } from "../core/contracts";
import { discovery } from "../core/discovery";
export async function recordEvent(
  pool: Pool,
  request: UnifiedRequest,
  outcome: "started" | "complete" | "failed" | "interrupted",
  errorClass?: string,
) {
  const transcript =
    outcome === "started"
      ? ""
      : (
          await pool.query(
            "SELECT transcript FROM attachments WHERE user_id=$1 AND message_id=$2 AND kind='audio' AND transcript IS NOT NULL",
            [request.userId, request.messageId],
          )
        ).rows
          .map((row) => row.transcript)
          .join(" ");
  // Classify transiently; no transcription content enters the event table.
  const d = discovery(request, transcript);
  if (d.unsupported)
    await recordBehavior(
      pool,
      request.userId,
      request.requestId,
      "unsupported_action",
    );
  const safeError = ["timeout", "response_failed", "interrupted"].includes(
    errorClass ?? "",
  )
    ? errorClass
    : null;
  await pool.query(
    `INSERT INTO product_events(user_id,request_id,intents,modalities,language,outcome,unsupported_target,error_class,unsupported_category,channel) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10 WHERE EXISTS(SELECT 1 FROM "user" WHERE id=$1) ON CONFLICT(user_id,request_id) DO UPDATE SET channel=EXCLUDED.channel,outcome=EXCLUDED.outcome,error_class=EXCLUDED.error_class,intents=EXCLUDED.intents,language=EXCLUDED.language,unsupported_target=EXCLUDED.unsupported_target,unsupported_category=COALESCE(product_events.unsupported_category,EXCLUDED.unsupported_category)`,
    [
      request.userId,
      request.requestId,
      d.intents,
      d.modalities,
      d.language,
      outcome,
      d.unsupported,
      safeError,
      d.unsupported
        ? ((
            {
              booking: "travel",
              payment: "money",
              mail: "communication",
              calendar: "productivity",
            } as Record<string, string>
          )[d.unsupported] ?? "other")
        : null,
      request.channel ?? "web",
    ],
  );
}

export type Behavior =
  | "artifact_created"
  | "artifact_accessed"
  | "artifact_retrieved"
  | "artifact_original_retrieved"
  | "artifact_searched"
  | "artifact_deleted"
  | "artifact_linked_to_state"
  | "state_created"
  | "state_revisited"
  | "state_updated"
  | "memory_created"
  | "memory_recalled"
  | "saved_item_created"
  | "unsupported_action"
  | "followup_created"
  | "followup_rescheduled"
  | "followup_triggered"
  | "followup_delivered"
  | "followup_opened"
  | "followup_completed"
  | "followup_dismissed"
  | "followup_cancelled"
  | "inbox_viewed"
  | "inbox_item_opened";
// Actual committed writes/reads only. No content, record names, URLs or identifiers.
export async function recordBehavior(
  pool: Pool | PoolClient,
  userId: string,
  requestId: string,
  behavior: Behavior,
) {
  await pool.query(
    `INSERT INTO product_events(user_id,request_id,intents,modalities,language,outcome,behaviors)
    SELECT $1,$2,'{}','{}','unknown','complete',ARRAY[$3::text] WHERE EXISTS(SELECT 1 FROM "user" WHERE id=$1)
    ON CONFLICT(user_id,request_id) DO UPDATE SET behaviors=ARRAY(SELECT DISTINCT unnest(product_events.behaviors||EXCLUDED.behaviors))`,
    [userId, requestId, behavior],
  );
}

export async function recordUnsupportedAction(
  pool: Pool,
  request: UnifiedRequest,
  category:
    | "travel"
    | "shopping"
    | "money"
    | "creator"
    | "productivity"
    | "fitness"
    | "communication"
    | "monitoring"
    | "other",
  capability = "other",
) {
  const active = await pool.query(
    `SELECT 1 FROM messages m JOIN "user" u ON u.id=m.user_id WHERE m.id=$1 AND m.user_id=$2 AND m.status='running' AND NOT u.processing_paused`,
    [request.messageId, request.userId],
  );
  if (!active.rowCount) return;
  await recordBehavior(
    pool,
    request.userId,
    request.requestId,
    "unsupported_action",
  );
  await pool.query(
    "UPDATE product_events SET unsupported_category=$3,unsupported_capability=$4,channel=$5 WHERE user_id=$1 AND request_id=$2",
    [
      request.userId,
      request.requestId,
      category,
      /^[a-z][a-z0-9_]{0,79}$/.test(capability) ? capability : "other",
      request.channel ?? "web",
    ],
  );
}
