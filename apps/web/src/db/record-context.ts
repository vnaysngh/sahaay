import type { Pool, PoolClient } from "pg";
import type { UnifiedRequest } from "../core/contracts";
export async function recordContext(
  pool: Pool,
  request: UnifiedRequest | undefined,
  userId: string,
  sourceIds: string[],
) {
  if (!request || request.userId !== userId || !sourceIds.length) return;
  await pool.query(
    "UPDATE messages SET context_record_source_ids=ARRAY(SELECT DISTINCT unnest(context_record_source_ids||$5::uuid[])) WHERE id=$1 AND user_id=$2 AND request_id=$3 AND conversation_id=$4 AND role='user' AND status='running'",
    [
      request.messageId,
      userId,
      request.requestId,
      request.conversationId,
      sourceIds,
    ],
  );
}
// A correction's own turn carries the replacement, not the superseded fact.
export async function replaceContextSources(
  client: PoolClient,
  request: UnifiedRequest,
  oldSources: string[],
) {
  await client.query(
    "UPDATE messages SET context_record_source_ids=ARRAY(SELECT unnest(context_record_source_ids) EXCEPT SELECT unnest($3::uuid[])) WHERE id=$1 AND user_id=$2",
    [request.messageId, request.userId, oldSources],
  );
}
