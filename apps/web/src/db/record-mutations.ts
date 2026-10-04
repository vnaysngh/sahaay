import type { Pool, PoolClient } from "pg";
import type { MutationContext } from "../core/memory";
import { persistencePermissions, isMemoryCorrection } from "../core/memory";
import { RequestError } from "../core/validation";
export type Operation =
  | "remember"
  | "update_memory"
  | "forget"
  | "save"
  | "update_item"
  | "remove_item";
export type Receipt = {
  targetId: string;
  version: number;
  suppressedSourceIds: string[];
};
export async function mutate<T>(
  pool: Pool,
  context: MutationContext,
  operation: Operation,
  replay: (client: PoolClient, id: string) => Promise<T>,
  write: (client: PoolClient) => Promise<{ receipt: Receipt; value: T }>,
): Promise<T> {
  const { request: r, actionId } = context;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(actionId))
    throw new RequestError(400, "action", "Invalid action identifier.");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
      r.userId,
    ]);
    const prior = (
      await client.query(
        "SELECT operation,target_id FROM record_mutations WHERE user_id=$1 AND request_id=$2 AND action_id=$3",
        [r.userId, r.requestId, actionId],
      )
    ).rows[0];
    if (prior) {
      if (prior.operation !== operation)
        throw new RequestError(
          409,
          "action_conflict",
          "This action was already used.",
        );
      const value = await replay(client, prior.target_id);
      await client.query("COMMIT");
      return value;
    }
    const message = (
      await client.query(
        `SELECT content FROM messages WHERE id=$1 AND user_id=$2 AND request_id=$3 AND conversation_id=$4 AND role='user' AND status='running' AND created_at>now()-interval '210 seconds' FOR UPDATE`,
        [r.messageId, r.userId, r.requestId, r.conversationId],
      )
    ).rows[0];
    if (!message)
      throw new RequestError(
        409,
        "inactive_request",
        "This request is no longer active.",
      );
    const audio = (
      await client.query(
        "SELECT transcript FROM attachments WHERE user_id=$1 AND message_id=$2 AND kind='audio' AND transcript IS NOT NULL",
        [r.userId, r.messageId],
      )
    ).rows;
    const explicitText = [
      message.content,
      ...audio.map((a) => a.transcript),
    ].join("\n");
    const p = persistencePermissions(explicitText);
    if (operation === "remember" && isMemoryCorrection(explicitText))
      throw new RequestError(
        409,
        "correction_required",
        "Read the existing memory and correct it instead of creating another fact.",
      );
    const allowed =
      operation === "forget"
        ? p.memoryDelete
        : operation === "remove_item"
          ? p.itemDelete
          : operation === "remember" || operation === "update_memory"
            ? p.memoryWrite
            : p.itemWrite;
    if (!allowed)
      throw new RequestError(
        403,
        "explicit_request_required",
        "Ask explicitly to remember, save, change or delete this record. Quoted content does not authorize changes.",
      );
    const count = (
      await client.query(
        "SELECT count(*)::int AS count FROM record_mutations WHERE user_id=$1 AND request_id=$2",
        [r.userId, r.requestId],
      )
    ).rows[0].count;
    if (count >= 8)
      throw new RequestError(
        429,
        "action_limit",
        "Too many changes in one request. Split the request into smaller steps.",
      );
    const { receipt, value } = await write(client);
    await client.query(
      "INSERT INTO record_mutations(user_id,request_id,action_id,operation,target_id,version,suppressed_source_ids) VALUES($1,$2,$3,$4,$5,$6,$7)",
      [
        r.userId,
        r.requestId,
        actionId,
        operation,
        receipt.targetId,
        receipt.version,
        receipt.suppressedSourceIds,
      ],
    );
    await client.query("COMMIT");
    return value;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
export function missing(): never {
  throw new RequestError(404, "record_not_found", "Record not found.");
}
export function stale(): never {
  throw new RequestError(
    409,
    "stale_record",
    "This record has changed. Read its current version before changing it.",
  );
}
