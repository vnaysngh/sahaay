import type { UnifiedRequest } from "../core/contracts";
import { recordContext, replaceContextSources } from "./record-context";
import type { Pool, PoolClient } from "pg";
import type {
  Memory,
  MemoryInput,
  MemoryService,
  MutationContext,
  MutationResult,
  RecordQuery,
} from "../core/memory";
import { memoryInput, searchTerms } from "../core/memory";
import { RequestError } from "../core/validation";
import { mutate, missing, stale } from "./record-mutations";
const projection = `m.id,m.memory_key AS "memoryKey",m.type,m.category,m.content,m.structured_value AS "structuredValue",m.scope,m.version,m.source_type AS "sourceType",m.source_id AS "sourceId",m.conversation_id AS "conversationId",m.confidence,m.valid_from AS "validFrom",m.valid_until AS "validUntil",m.supersedes_id AS "supersedesId",m.created_at AS "createdAt",m.updated_at AS "updatedAt",EXISTS(SELECT 1 FROM messages s WHERE s.id=m.source_id AND s.user_id=m.user_id AND s.created_at>now()-interval '7 days') AS "sourceAvailable"`;
const current = "m.valid_until IS NULL AND m.valid_from<=now()";
function dates(row: Memory): Memory {
  return JSON.parse(JSON.stringify(row));
}
export class PostgresMemory implements MemoryService {
  constructor(
    private pool: Pool,
    private request?: UnifiedRequest,
  ) {}
  async recall(userId: string, q: RecordQuery): Promise<Memory[]> {
    if ((q.query?.length ?? 0) > 300)
      throw new RequestError(400, "query", "Use a shorter memory query.");
    const terms = q.query ? searchTerms(q.query) : [];
    if (q.query && !terms.length) return [];
    const records = (
      await this.pool.query(
        `SELECT ${projection} FROM memories m WHERE m.user_id=$1 AND ${current} AND m.scope=$2 AND ($3::text IS NULL OR m.category=$3) AND ($4::text IS NULL OR m.type=$4) AND ($5::boolean OR EXISTS(SELECT 1 FROM unnest($6::text[]) term WHERE strpos(lower(m.content||' '||m.memory_key||' '||COALESCE(m.category,'')||' '||COALESCE(m.structured_value::text,'')),term)>0)) ORDER BY m.updated_at DESC,m.id LIMIT 8`,
        [
          userId,
          q.scope ?? "personal",
          q.category ?? null,
          q.type ?? null,
          !q.query,
          terms,
        ],
      )
    ).rows.map(dates);
    await recordContext(
      this.pool,
      this.request,
      userId,
      records.map((r) => r.sourceId),
    );
    return records;
  }
  private async get(
    c: PoolClient,
    owner: string,
    id: string,
  ): Promise<Memory | null> {
    const row = (
      await c.query(
        `SELECT ${projection} FROM memories m WHERE m.user_id=$1 AND m.id=$2 AND ${current}`,
        [owner, id],
      )
    ).rows[0];
    return row ? dates(row) : null;
  }
  private replay(
    c: PoolClient,
    owner: string,
    id: string,
  ): Promise<MutationResult<Memory>> {
    return this.get(c, owner, id).then((record) => ({
      outcome: record ? "replayed" : "deleted",
      record,
      targetId: id,
    }));
  }
  private async insert(
    c: PoolClient,
    ctx: MutationContext,
    v: MemoryInput,
    version = 1,
    supersedes: string | null = null,
  ) {
    const r = ctx.request;
    const id = (
      await c.query(
        "INSERT INTO memories(user_id,memory_key,type,category,content,structured_value,scope,source_id,conversation_id,version,supersedes_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id",
        [
          r.userId,
          v.memoryKey,
          v.type,
          v.category,
          v.content,
          v.structuredValue,
          v.scope,
          r.messageId,
          r.conversationId,
          version,
          supersedes,
        ],
      )
    ).rows[0].id;
    return (await this.get(c, r.userId, id))!;
  }
  async remember(ctx: MutationContext, input: MemoryInput) {
    const v = memoryInput.parse(input),
      owner = ctx.request.userId;
    return mutate(
      this.pool,
      ctx,
      "remember",
      (c, id) => this.replay(c, owner, id),
      async (c) => {
        const existing = (
          await c.query(
            `SELECT id FROM memories m WHERE user_id=$1 AND scope=$2 AND memory_key=$3 AND ${current}`,
            [owner, v.scope, v.memoryKey],
          )
        ).rows[0];
        if (existing)
          throw new RequestError(
            409,
            "existing_memory",
            "A current memory with this key exists. Read it and explicitly correct it instead.",
          );
        if (
          (
            await c.query(
              "SELECT count(*)::int AS n FROM memories WHERE user_id=$1",
              [owner],
            )
          ).rows[0].n >= 500
        )
          throw new RequestError(
            429,
            "memory_limit",
            "Memory preview limit reached. Delete unused memories first.",
          );
        const record = await this.insert(c, ctx, v);
        return {
          receipt: {
            targetId: record.id,
            version: record.version,
            suppressedSourceIds: [],
          },
          value: { outcome: "committed" as const, record, targetId: record.id },
        };
      },
    );
  }
  async update(
    ctx: MutationContext,
    id: string,
    expectedVersion: number,
    input: MemoryInput,
  ) {
    const v = memoryInput.parse(input),
      owner = ctx.request.userId;
    return mutate(
      this.pool,
      ctx,
      "update_memory",
      (c, target) => this.replay(c, owner, target),
      async (c) => {
        const old = await this.get(c, owner, id);
        if (!old) {
          if (
            (
              await c.query(
                "SELECT id FROM memories WHERE id=$1 AND user_id=$2",
                [id, owner],
              )
            ).rowCount
          )
            stale();
          missing();
        }
        if (old.version !== expectedVersion) stale();
        if (old.memoryKey !== v.memoryKey || old.scope !== v.scope)
          throw new RequestError(
            400,
            "memory_identity",
            "A correction must keep the same memory key and scope.",
          );
        const sources = (
          await c.query(
            "SELECT source_id FROM memories WHERE user_id=$1 AND scope=$2 AND memory_key=$3",
            [owner, old.scope, old.memoryKey],
          )
        ).rows.map((x) => x.source_id);
        await c.query(
          "UPDATE memories SET valid_until=now(),updated_at=now() WHERE id=$1 AND user_id=$2",
          [id, owner],
        );
        await replaceContextSources(c, ctx.request, sources);
        const record = await this.insert(c, ctx, v, old.version + 1, id);
        return {
          receipt: {
            targetId: record.id,
            version: record.version,
            suppressedSourceIds: sources.filter(
              (s) => s !== ctx.request.messageId,
            ),
          },
          value: { outcome: "committed" as const, record, targetId: record.id },
        };
      },
    );
  }
  async forget(ctx: MutationContext, id: string, expectedVersion: number) {
    const owner = ctx.request.userId;
    return mutate(
      this.pool,
      ctx,
      "forget",
      (c, target) => this.replay(c, owner, target),
      async (c) => {
        const old = await this.get(c, owner, id);
        if (!old) {
          if (
            (
              await c.query(
                "SELECT id FROM memories WHERE id=$1 AND user_id=$2",
                [id, owner],
              )
            ).rowCount
          )
            stale();
          missing();
        }
        if (old.version !== expectedVersion) stale();
        const removed = await c.query(
          "DELETE FROM memories WHERE user_id=$1 AND scope=$2 AND memory_key=$3 RETURNING source_id",
          [owner, old.scope, old.memoryKey],
        );
        return {
          receipt: {
            targetId: id,
            version: old.version,
            suppressedSourceIds: removed.rows.map((x) => x.source_id),
          },
          value: { outcome: "deleted" as const, record: null, targetId: id },
        };
      },
    );
  }
}
