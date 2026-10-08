import type { Pool } from "pg";
import { z } from "zod";
import { recordBehavior } from "./events";
import type { SavedItem } from "../core/items";
// Same owned records as the agent; no channel table, duplicate state or materialized view.
export async function lifeState(
  pool: Pool,
  owner: string,
  objectId?: string,
  page = 0,
  pageSize = 24,
) {
  if (objectId && !z.string().uuid().safeParse(objectId).success) return null;
  const parent = objectId
    ? (
        await pool.query(
          `SELECT id,content,kind,state_label AS "stateLabel",structured_value AS "structuredValue",status FROM saved_items WHERE id=$1 AND user_id=$2 AND record_role='object'`,
          [objectId, owner],
        )
      ).rows[0]
    : null;
  if (objectId && !parent) return null;
  const size = Math.max(1, Math.min(500, Math.floor(pageSize) || 24));
  const offset = Math.max(0, Math.min(25, Math.floor(page) || 0)) * size;
  const result = await pool.query(
    `SELECT i.id,i.content,i.kind,i.url,i.record_role AS "recordRole",i.parent_id AS "parentId",i.state_label AS "stateLabel",i.structured_value AS "structuredValue",i.status,i.list_label AS "listLabel",i.updated_at AS "updatedAt",
    (SELECT count(*)::int FROM saved_items child WHERE child.user_id=i.user_id AND child.parent_id=i.id) AS "itemCount",
    count(*) OVER()::int AS total
    FROM saved_items i WHERE i.user_id=$1 AND (($2::uuid IS NULL AND i.parent_id IS NULL) OR i.parent_id=$2)
    ORDER BY (i.status='archived'),(i.record_role='object') DESC,i.updated_at DESC,i.id LIMIT $4 OFFSET $3`,
    [owner, objectId ?? null, offset, size],
  );
  const memories = objectId
    ? []
    : (
        await pool.query(
          `SELECT id,content FROM memories WHERE user_id=$1 AND scope='personal' AND valid_until IS NULL AND valid_from<=now() ORDER BY updated_at DESC LIMIT 8`,
          [owner],
        )
      ).rows;
  if (result.rows.length || memories.length || parent)
    await recordBehavior(pool, owner, crypto.randomUUID(), "state_revisited");
  return {
    parent,
    records: result.rows as (Pick<
      SavedItem,
      | "id"
      | "content"
      | "kind"
      | "url"
      | "listLabel"
      | "recordRole"
      | "parentId"
      | "stateLabel"
      | "structuredValue"
      | "status"
      | "updatedAt"
    > & {
      itemCount: number;
      total: number;
    })[],
    memories,
    hasNext:
      result.rows.length === size && result.rows[0].total > offset + size,
    page: offset / size,
  };
}
