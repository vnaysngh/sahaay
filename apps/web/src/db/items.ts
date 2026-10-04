import type { UnifiedRequest } from "../core/contracts";
import { recordContext, replaceContextSources } from "./record-context";
import type { Pool, PoolClient } from "pg";
import type { ItemInput, SavedItem, SavedItemService } from "../core/items";
import { itemInput, normalizeListLabel } from "../core/items";
import type {
  MutationContext,
  MutationResult,
  RecordQuery,
} from "../core/memory";
import { searchTerms } from "../core/memory";
import { RequestError } from "../core/validation";
import { mutate, missing, stale } from "./record-mutations";
const projection = `i.id,i.kind,i.content,i.url,i.structured_value AS "structuredValue",i.list_label AS "listLabel",i.status,i.version,i.source_type AS "sourceType",i.source_id AS "sourceId",i.conversation_id AS "conversationId",i.created_at AS "createdAt",i.updated_at AS "updatedAt",EXISTS(SELECT 1 FROM messages s WHERE s.id=i.source_id AND s.user_id=i.user_id AND s.created_at>now()-interval '7 days') AS "sourceAvailable"`;
export class PostgresSavedItems implements SavedItemService {
  constructor(
    private pool: Pool,
    private request?: UnifiedRequest,
  ) {}
  async find(owner: string, q: RecordQuery): Promise<SavedItem[]> {
    if ((q.query?.length ?? 0) > 300)
      throw new RequestError(400, "query", "Use a shorter item query.");
    const terms = q.query ? searchTerms(q.query) : [];
    if (q.query && !terms.length) return [];
    const records: SavedItem[] = JSON.parse(
      JSON.stringify(
        (
          await this.pool.query(
            `SELECT ${projection} FROM saved_items i WHERE user_id=$1 AND ($2::text IS NULL OR list_label=$2) AND ($3::text IS NULL OR status=$3) AND ($4::boolean OR EXISTS(SELECT 1 FROM unnest($5::text[]) term WHERE strpos(lower(content||' '||kind||' '||COALESCE(list_label,'')||' '||COALESCE(url,'')||' '||COALESCE(structured_value::text,'')),term)>0)) ORDER BY updated_at DESC,id LIMIT 8`,
            [
              owner,
              normalizeListLabel(q.listLabel),
              q.status ?? null,
              !q.query,
              terms,
            ],
          )
        ).rows,
      ),
    );
    await recordContext(
      this.pool,
      this.request,
      owner,
      records.map((r) => r.sourceId),
    );
    return records;
  }
  private async get(
    c: PoolClient,
    owner: string,
    id: string,
  ): Promise<SavedItem | null> {
    const r = (
      await c.query(
        `SELECT ${projection} FROM saved_items i WHERE i.user_id=$1 AND i.id=$2`,
        [owner, id],
      )
    ).rows[0];
    return r ? JSON.parse(JSON.stringify(r)) : null;
  }
  private async replay(
    c: PoolClient,
    owner: string,
    id: string,
  ): Promise<MutationResult<SavedItem>> {
    const record = await this.get(c, owner, id);
    return { outcome: record ? "replayed" : "deleted", record, targetId: id };
  }
  async save(ctx: MutationContext, input: ItemInput) {
    const parsed = itemInput.parse(input);
    const v = { ...parsed, listLabel: normalizeListLabel(parsed.listLabel) },
      r = ctx.request;
    return mutate(
      this.pool,
      ctx,
      "save",
      (c, id) => this.replay(c, r.userId, id),
      async (c) => {
        if (
          (
            await c.query(
              "SELECT count(*)::int AS n FROM saved_items WHERE user_id=$1",
              [r.userId],
            )
          ).rows[0].n >= 500
        )
          throw new RequestError(
            429,
            "item_limit",
            "Saved-item preview limit reached. Delete unused items first.",
          );
        const id = (
          await c.query(
            "INSERT INTO saved_items(user_id,kind,content,url,structured_value,list_label,status,source_id,conversation_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
            [
              r.userId,
              v.kind,
              v.content,
              v.url,
              v.structuredValue,
              v.listLabel,
              v.status,
              r.messageId,
              r.conversationId,
            ],
          )
        ).rows[0].id;
        const record = (await this.get(c, r.userId, id))!;
        return {
          receipt: { targetId: id, version: 1, suppressedSourceIds: [] },
          value: { outcome: "committed" as const, record, targetId: id },
        };
      },
    );
  }
  async update(
    ctx: MutationContext,
    id: string,
    expectedVersion: number,
    input: ItemInput,
  ) {
    const parsed = itemInput.parse(input);
    const v = { ...parsed, listLabel: normalizeListLabel(parsed.listLabel) },
      owner = ctx.request.userId;
    return mutate(
      this.pool,
      ctx,
      "update_item",
      (c, target) => this.replay(c, owner, target),
      async (c) => {
        const old = await this.get(c, owner, id);
        if (!old) missing();
        if (old.version !== expectedVersion) stale();
        await c.query(
          "UPDATE saved_items SET kind=$3,content=$4,url=$5,structured_value=$6,list_label=$7,status=$8,version=version+1,source_id=$9,conversation_id=$10,updated_at=now() WHERE id=$1 AND user_id=$2",
          [
            id,
            owner,
            v.kind,
            v.content,
            v.url,
            v.structuredValue,
            v.listLabel,
            v.status,
            ctx.request.messageId,
            ctx.request.conversationId,
          ],
        );
        await replaceContextSources(c, ctx.request, [old.sourceId]);
        const record = (await this.get(c, owner, id))!;
        return {
          receipt: {
            targetId: id,
            version: record.version,
            suppressedSourceIds: [old.sourceId].filter(
              (s) => s !== ctx.request.messageId,
            ),
          },
          value: { outcome: "committed" as const, record, targetId: id },
        };
      },
    );
  }
  async remove(ctx: MutationContext, id: string, expectedVersion: number) {
    const owner = ctx.request.userId;
    return mutate(
      this.pool,
      ctx,
      "remove_item",
      (c, target) => this.replay(c, owner, target),
      async (c) => {
        const old = await this.get(c, owner, id);
        if (!old) missing();
        if (old.version !== expectedVersion) stale();
        await c.query("DELETE FROM saved_items WHERE id=$1 AND user_id=$2", [
          id,
          owner,
        ]);
        return {
          receipt: {
            targetId: id,
            version: old.version,
            suppressedSourceIds: [old.sourceId],
          },
          value: { outcome: "deleted" as const, record: null, targetId: id },
        };
      },
    );
  }
}
