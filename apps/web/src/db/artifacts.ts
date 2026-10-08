import type { Pool, PoolClient } from "pg";
import type { UnifiedRequest } from "../core/contracts";
import type { MutationContext, MutationResult } from "../core/memory";
import { searchTerms } from "../core/memory";
import {
  artifactInput,
  cleanUnderstanding,
  maskIdentifiers,
  type ArtifactInput,
  type Artifact,
  type ArtifactSummary,
  type ArtifactService,
} from "../core/artifacts";
import { seal, unseal } from "../media/artifact-crypto";
import { mutate, missing, stale } from "./record-mutations";
import { recordBehavior, type Behavior } from "./events";
import { recordContext } from "./record-context";
import { DeletionJournal } from "../privacy/journal";
import { MediaFiles } from "../media/files";
import { RequestError } from "../core/validation";
const projection = `id,title,category,mime_type AS mime,size_bytes AS bytes,related_item_id AS "relatedItemId",created_at AS "createdAt",version`;
function summary(row: ArtifactSummary): ArtifactSummary {
  return JSON.parse(JSON.stringify(row));
}
export class PostgresArtifacts implements ArtifactService {
  constructor(
    private pool: Pool,
    private request?: UnifiedRequest,
  ) {}
  private async event(c: Pool | PoolClient, owner: string, behavior: Behavior) {
    await recordBehavior(
      c,
      owner,
      this.request?.requestId ?? crypto.randomUUID(),
      behavior,
    );
  }
  private async row(c: Pool | PoolClient, owner: string, id: string) {
    const row = (
      await c.query(
        `SELECT ${projection},understanding,source_message_id,source_attachment_id FROM artifacts WHERE user_id=$1 AND id=$2`,
        [owner, id],
      )
    ).rows[0];
    if (!row) missing();
    return row;
  }
  private async replay(
    c: PoolClient,
    owner: string,
    id: string,
  ): Promise<MutationResult<ArtifactSummary>> {
    const row = (
      await c.query(
        `SELECT ${projection} FROM artifacts WHERE user_id=$1 AND id=$2`,
        [owner, id],
      )
    ).rows[0];
    return {
      outcome: row ? "replayed" : "deleted",
      record: row ? summary(row) : null,
      targetId: id,
    };
  }
  async create(ctx: MutationContext, input: ArtifactInput) {
    const v = artifactInput.parse(input),
      owner = ctx.request.userId;
    return mutate<MutationResult<ArtifactSummary>>(
      this.pool,
      ctx,
      "artifact_create",
      (c, id) => this.replay(c, owner, id),
      async (c) => {
        const old = (
          await c.query(
            `SELECT ${projection} FROM artifacts WHERE user_id=$1 AND source_attachment_id=$2`,
            [owner, v.attachmentId],
          )
        ).rows[0];
        if (old)
          return {
            receipt: {
              targetId: old.id,
              version: old.version,
              suppressedSourceIds: [],
            },
            value: {
              outcome: "replayed",
              record: summary(old),
              targetId: old.id,
            },
          };
        const a = (
          await c.query(
            `SELECT * FROM attachments WHERE id=$1 AND user_id=$2 AND conversation_id=$3 AND kind='image' AND expires_at>now() AND original_image IS NOT NULL FOR UPDATE`,
            [v.attachmentId, owner, ctx.request.conversationId],
          )
        ).rows[0];
        if (!a)
          throw new RequestError(
            410,
            "original_unavailable",
            "The received original is unavailable or expired. Upload the image again; I will not substitute the converted preview.",
          );
        if (
          v.relatedItemId &&
          !(
            await c.query(
              "SELECT 1 FROM saved_items WHERE id=$1 AND user_id=$2",
              [v.relatedItemId, owner],
            )
          ).rowCount
        )
          missing();
        if (
          (
            await c.query(
              "SELECT count(*)::int n FROM artifacts WHERE user_id=$1",
              [owner],
            )
          ).rows[0].n >= 100
        )
          throw new RequestError(
            429,
            "artifact_limit",
            "Documents currently supports up to 100 images. Delete an older document first.",
          );
        const used = (
          await c.query(
            "SELECT coalesce(sum(size_bytes),0)::bigint used FROM artifacts WHERE user_id=$1",
            [owner],
          )
        ).rows[0].used;
        if (Number(used) + a.original_bytes > 256 * 1024 * 1024)
          throw new RequestError(
            429,
            "artifact_storage_limit",
            "Documents storage is full. Delete an older document first.",
          );
        const id = crypto.randomUUID(),
          original = await unseal(
            a.original_image,
            owner,
            a.id,
            "temporary_image",
          ),
          understanding = await seal(
            Buffer.from(JSON.stringify(cleanUnderstanding(v))),
            owner,
            id,
            "understanding",
          );
        await c.query(
          `INSERT INTO artifacts(id,user_id,title,category,mime_type,size_bytes,original,understanding,source_attachment_id,source_message_id,source_conversation_id,related_item_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            id,
            owner,
            maskIdentifiers(v.title),
            v.category,
            a.original_mime,
            a.original_bytes,
            await seal(original, owner, id, "original"),
            understanding,
            a.id,
            ctx.request.messageId,
            a.conversation_id,
            v.relatedItemId,
          ],
        );
        await this.event(c, owner, "artifact_created");
        if (v.relatedItemId)
          await this.event(c, owner, "artifact_linked_to_state");
        return {
          receipt: { targetId: id, version: 1, suppressedSourceIds: [] },
          value: {
            outcome: "committed",
            record: summary(
              (
                await c.query(
                  `SELECT ${projection} FROM artifacts WHERE id=$1 AND user_id=$2`,
                  [id, owner],
                )
              ).rows[0],
            ),
            targetId: id,
          },
        };
      },
      { input: v },
    );
  }
  async search(owner: string, query: string | null, category?: string | null) {
    if ((query?.length ?? 0) > 300)
      throw new RequestError(400, "query", "Use a shorter document query.");
    const rows = (
      await this.pool.query(
        `SELECT ${projection},understanding FROM artifacts WHERE user_id=$1 AND ($2::text IS NULL OR category=$2) ORDER BY created_at DESC LIMIT 100`,
        [owner, category ?? null],
      )
    ).rows;
    const terms = query ? searchTerms(query) : [];
    const scored = [];
    for (const row of rows) {
      let score = 0;
      if (terms.length) {
        const data = JSON.parse(
          (
            await unseal(row.understanding, owner, row.id, "understanding")
          ).toString(),
        );
        const text = (
          row.title +
          " " +
          row.category +
          " " +
          JSON.stringify(data)
        ).toLocaleLowerCase();
        score = terms.filter((t) => text.includes(t)).length;
        if (!score) continue;
      }
      scored.push({ row, score });
    }
    scored.sort((a, b) => b.score - a.score);
    await this.event(this.pool, owner, "artifact_searched");
    return scored.slice(0, 20).map(({ row }) => {
      const { understanding: _, ...safe } = row;
      void _;
      return summary(safe);
    });
  }
  async get(owner: string, id: string): Promise<Artifact> {
    const row = await this.row(this.pool, owner, id),
      data = JSON.parse(
        (
          await unseal(row.understanding, owner, id, "understanding")
        ).toString(),
      );
    await recordContext(this.pool, this.request, owner, [
      row.source_message_id,
    ]);
    await this.event(this.pool, owner, "artifact_accessed");
    await this.event(this.pool, owner, "artifact_retrieved");
    const {
      understanding: _,
      source_message_id: __,
      source_attachment_id: ___,
      ...safe
    } = row;
    void _;
    void __;
    void ___;
    return { ...summary(safe), ...data };
  }
  async getOriginal(owner: string, id: string) {
    const row = (
      await this.pool.query(
        `SELECT ${projection},original FROM artifacts WHERE user_id=$1 AND id=$2`,
        [owner, id],
      )
    ).rows[0];
    if (!row) missing();
    const data = await unseal(row.original, owner, id, "original");
    await this.event(this.pool, owner, "artifact_original_retrieved");
    const { original: _, ...safe } = row;
    void _;
    return { artifact: summary(safe), data };
  }
  async requestOriginal(ctx: MutationContext, id: string) {
    const owner = ctx.request.userId,
      current = await this.row(this.pool, owner, id);
    const result = await mutate<MutationResult<ArtifactSummary>>(
      this.pool,
      ctx,
      "artifact_original",
      (c, target) => this.replay(c, owner, target),
      async (c) => {
        const row = await this.row(c, owner, id),
          {
            understanding: _,
            source_message_id: __,
            source_attachment_id: ___,
            ...safe
          } = row;
        void _;
        void __;
        void ___;
        return {
          receipt: {
            targetId: id,
            version: row.version,
            suppressedSourceIds: [],
          },
          value: { outcome: "committed", record: summary(safe), targetId: id },
        };
      },
      {
        current: {
          id: current.id,
          title: current.title,
          category: current.category,
        },
      },
    );
    if (!result.record) missing();
    return result.record;
  }
  private async erase(
    c: PoolClient,
    owner: string,
    id: string,
    version: number,
  ) {
    const row = await this.row(c, owner, id);
    if (row.version !== version) stale();
    const upload = (
      await c.query(
        "SELECT message_id FROM attachments WHERE id=$1 AND user_id=$2",
        [row.source_attachment_id, owner],
      )
    ).rows[0];
    const sources = [row.source_message_id, upload?.message_id].filter(Boolean);
    await new DeletionJournal().append({
      kind: "artifact",
      userId: owner,
      ids: [id],
      sourceIds: [...sources, row.source_attachment_id],
    });
    // Content-free tombstone suppresses source and derived turns for the full chat-retention window, including Web deletion.
    await c.query(
      "INSERT INTO record_mutations(user_id,request_id,action_id,operation,target_id,version,suppressed_source_ids) VALUES($1,$2,$3,'artifact_delete',$4,$5,$6)",
      [owner, crypto.randomUUID(), crypto.randomUUID(), id, version, sources],
    );
    await c.query("DELETE FROM artifacts WHERE id=$1 AND user_id=$2", [
      id,
      owner,
    ]);
    await c.query("DELETE FROM attachments WHERE id=$1 AND user_id=$2", [
      row.source_attachment_id,
      owner,
    ]);
    await this.event(c, owner, "artifact_deleted");
    return row.source_attachment_id as string;
  }
  async delete(ctx: MutationContext, id: string, version: number) {
    const owner = ctx.request.userId;
    const current =
      (
        await this.pool.query(
          `SELECT ${projection} FROM artifacts WHERE id=$1 AND user_id=$2`,
          [id, owner],
        )
      ).rows[0] ?? null;
    let media: string | undefined;
    const result = await mutate<MutationResult<ArtifactSummary>>(
      this.pool,
      ctx,
      "artifact_delete",
      (c, target) => this.replay(c, owner, target),
      async (c) => {
        media = await this.erase(c, owner, id, version);
        return {
          receipt: { targetId: id, version, suppressedSourceIds: [] },
          value: { outcome: "committed", record: null, targetId: id },
        };
      },
      { current },
    );
    if (media) await new MediaFiles().remove(media);
    return result;
  }
  async deleteWeb(owner: string, id: string, version: number) {
    const c = await this.pool.connect();
    let media: string | undefined;
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        owner,
      ]);
      media = await this.erase(c, owner, id, version);
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
    if (media) await new MediaFiles().remove(media);
  }
}
