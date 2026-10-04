import type { Pool, PoolClient } from "pg";
import type {
  ConversationStore,
  UnifiedRequest,
  ConversationMessage,
  ResearchSource,
} from "../core/contracts";
import { RequestError } from "../core/validation";
export type StoredMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  status: string;
  requestId: string;
  createdAt: string;
  sources?: ResearchSource[];
  attachments?: import("../media/attachments").Attachment[];
};
export class PostgresConversations implements ConversationStore {
  constructor(private pool: Pool) {}
  async cleanup() {
    await this.pool.query(
      "DELETE FROM messages WHERE created_at < now() - interval '7 days'",
    );
    await this.pool.query(
      "DELETE FROM conversations c WHERE NOT EXISTS (SELECT 1 FROM messages m WHERE m.conversation_id=c.id) AND c.created_at < now() - interval '7 days'",
    );
    await this.pool.query(
      "UPDATE conversations c SET title=COALESCE((SELECT left(content,70) FROM messages m WHERE m.conversation_id=c.id AND m.role='user' ORDER BY m.created_at LIMIT 1),'New conversation') WHERE c.created_at < now()-interval '7 days'",
    );
    await this.pool.query(
      "UPDATE messages SET status='interrupted', error_code='interrupted', completed_at=now() WHERE status='running' AND created_at < now() - interval '210 seconds'",
    );
  }
  async list(userId: string) {
    await this.cleanup();
    return (
      await this.pool.query(
        'SELECT id, title, updated_at AS "updatedAt" FROM conversations WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 50',
        [userId],
      )
    ).rows;
  }
  async create(userId: string) {
    return (
      await this.pool.query(
        'INSERT INTO conversations (user_id) VALUES ($1) RETURNING id, title, updated_at AS "updatedAt"',
        [userId],
      )
    ).rows[0];
  }
  async history(userId: string, conversationId: string) {
    await this.cleanup();
    const owned = await this.pool.query(
      "SELECT id FROM conversations WHERE user_id=$1 AND id=$2",
      [userId, conversationId],
    );
    if (!owned.rowCount)
      throw new RequestError(404, "not_found", "Conversation not found.");
    const rows = (
      await this.pool.query(
        `SELECT id, role, content, status, request_id AS "requestId", created_at AS "createdAt" FROM (SELECT * FROM messages WHERE user_id=$1 AND conversation_id=$2 ORDER BY created_at DESC, role ASC LIMIT 100) recent ORDER BY created_at, role DESC`,
        [userId, conversationId],
      )
    ).rows as StoredMessage[];
    const media = (
      await this.pool.query(
        `SELECT id,message_id,kind,filename,mime,bytes,width,height,duration,transcript,expires_at AS "expiresAt",provider_metadata AS metadata, expires_at>now() AS available FROM attachments WHERE user_id=$1 AND message_id=ANY($2::uuid[]) ORDER BY created_at,id`,
        [userId, rows.map((r) => r.id)],
      )
    ).rows;
    for (const row of rows) {
      const attachments = media.filter((a) => a.message_id === row.id);
      if (attachments.length) row.attachments = attachments;
    }
    const sources = (
      await this.pool.query(
        `SELECT message_id, source_key AS id,url,title,kind,retrieved_at AS "retrievedAt",published_at AS "publishedAt" FROM research_sources WHERE user_id=$1 AND message_id=ANY($2::uuid[]) ORDER BY source_key`,
        [userId, rows.map((r) => r.id)],
      )
    ).rows;
    for (const row of rows) {
      const owned = sources
        .filter((s) => s.message_id === row.id)
        .map((s) => ({
          id: s.id,
          url: s.url,
          title: s.title,
          kind: s.kind,
          retrievedAt: s.retrievedAt,
          publishedAt: s.publishedAt,
        }));
      if (owned.length) row.sources = owned;
    }
    return rows;
  }

  async begin(
    userId: string,
    input: {
      conversationId: string;
      requestId: string;
      text: string;
      attachmentIds?: string[];
    },
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      // Serialize quota checks across a user's conversations without another service.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
        [userId],
      );
      const owned = await client.query(
        "SELECT id FROM conversations WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [input.conversationId, userId],
      );
      if (!owned.rowCount)
        throw new RequestError(404, "not_found", "Conversation not found.");
      const existing = await client.query(
        "SELECT id, conversation_id, content, status FROM messages WHERE user_id=$1 AND request_id=$2 AND role='user'",
        [userId, input.requestId],
      );
      if (existing.rowCount) {
        const row = existing.rows[0];
        if (
          row.conversation_id !== input.conversationId ||
          row.content !== input.text
        )
          throw new RequestError(
            409,
            "request_conflict",
            "This request ID belongs to another message.",
          );
        const previous = (
          await client.query(
            "SELECT id FROM attachments WHERE user_id=$1 AND message_id=$2 ORDER BY id",
            [userId, row.id],
          )
        ).rows.map((r) => r.id);
        if (
          JSON.stringify(previous) !==
          JSON.stringify([...(input.attachmentIds ?? [])].sort())
        )
          throw new RequestError(
            409,
            "request_conflict",
            "This request ID belongs to different attachments.",
          );
        await client.query("COMMIT");
        return {
          duplicate: true as const,
          messageId: row.id as string,
          status: row.status as string,
        };
      }
      await client.query(
        "UPDATE messages SET status='interrupted', error_code='interrupted', completed_at=now() WHERE user_id=$1 AND status='running' AND created_at < now() - interval '210 seconds'",
        [userId],
      );
      const busy = await client.query(
        "SELECT id FROM messages WHERE conversation_id=$1 AND status='running'",
        [input.conversationId],
      );
      if (busy.rowCount)
        throw new RequestError(
          409,
          "busy",
          "Please wait for the current response.",
        );
      const count = await client.query(
        "SELECT count(*)::int AS count FROM messages WHERE user_id=$1 AND role='user' AND created_at > now() - interval '1 hour'",
        [userId],
      );
      if (count.rows[0].count >= 30)
        throw new RequestError(
          429,
          "quota",
          "You’ve reached the local preview limit. Try again in an hour.",
        );
      const attachmentIds = input.attachmentIds ?? [];
      const media = attachmentIds.length
        ? (
            await client.query(
              "SELECT id,kind FROM attachments WHERE user_id=$1 AND id=ANY($2::uuid[]) AND message_id IS NULL AND expires_at>now() ORDER BY id FOR UPDATE",
              [userId, attachmentIds],
            )
          ).rows
        : [];
      if (media.length !== attachmentIds.length)
        throw new RequestError(
          404,
          "attachment",
          "An attachment is expired or unavailable. Upload it again.",
        );
      if (
        media.filter((a) => a.kind === "audio").length > 1 ||
        media.filter((a) => a.kind === "image").length > 3
      )
        throw new RequestError(
          400,
          "attachment_limit",
          "Send up to 3 images and 1 voice clip at a time.",
        );
      const row = (
        await client.query(
          "INSERT INTO messages (conversation_id,user_id,request_id,role,content,status) VALUES ($1,$2,$3,'user',$4,'running') RETURNING id, created_at",
          [input.conversationId, userId, input.requestId, input.text],
        )
      ).rows[0];
      if (media.length)
        await client.query(
          "UPDATE attachments SET message_id=$3,conversation_id=$4 WHERE user_id=$1 AND id=ANY($2::uuid[])",
          [userId, attachmentIds, row.id, input.conversationId],
        );
      await client.query(
        "UPDATE conversations SET title=CASE WHEN title='New conversation' THEN $3 ELSE title END, updated_at=now() WHERE id=$1 AND user_id=$2",
        [
          input.conversationId,
          userId,
          input.text.slice(0, 70) ||
            (media.some((m) => m.kind === "image")
              ? "Image conversation"
              : "Voice conversation"),
        ],
      );
      await client.query("COMMIT");
      return {
        duplicate: false as const,
        request: {
          userId,
          conversationId: input.conversationId,
          requestId: input.requestId,
          messageId: row.id,
          inputs: [
            { type: "text" as const, text: input.text },
            ...media.map((m) => ({
              type: m.kind as "image" | "audio",
              attachmentId: m.id as string,
            })),
          ],
          receivedAt: row.created_at.toISOString(),
        },
      };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async context(userId: string, conversationId: string, messageId: string) {
    // Include complete turn pairs and the current user input; failed turns are not context.
    const rows = (
      await this.pool.query(
        `SELECT id,role,content FROM (SELECT * FROM messages WHERE user_id=$1 AND conversation_id=$2 AND created_at > now()-interval '7 days' AND (status='complete' OR id=$3) ORDER BY created_at DESC,role ASC LIMIT 20) recent ORDER BY created_at,role DESC`,
        [userId, conversationId, messageId],
      )
    ).rows;
    let size = 0;
    const result: ConversationMessage[] = [];
    const selectedRows: typeof rows = [];
    for (let i = rows.length - 1; i >= 0; i--) {
      size += rows[i].content.length;
      if (size > 16_000) break;
      selectedRows.unshift(rows[i]);
      result.unshift({ role: rows[i].role, content: rows[i].content });
    }
    while (result[0]?.role === "assistant") {
      result.shift();
      selectedRows.shift();
    }
    const media = (
      await this.pool.query(
        "SELECT id,kind,message_id FROM attachments WHERE user_id=$1 AND message_id=ANY($2::uuid[]) ORDER BY created_at,id",
        [userId, rows.map((r) => r.id)],
      )
    ).rows;
    for (const [index, message] of result.entries()) {
      const row = selectedRows[index];
      const references = media
        .filter((a) => a.message_id === row?.id)
        .map((a) => ({
          id: a.id as string,
          kind: a.kind as "image" | "audio",
        }));
      if (references.length) message.attachments = references;
    }
    return result;
  }
  async complete(
    request: UnifiedRequest,
    text: string,
    sources: ResearchSource[] = [],
  ) {
    return this.finish(request, async (client) => {
      const result = await client.query(
        "INSERT INTO messages (conversation_id,user_id,request_id,role,content,status,completed_at) VALUES ($1,$2,$3,'assistant',$4,'complete',now()) RETURNING id",
        [request.conversationId, request.userId, request.requestId, text],
      );
      const id = result.rows[0].id as string;
      for (const source of sources)
        await client.query(
          "INSERT INTO research_sources(user_id,message_id,source_key,url,title,kind,retrieved_at,published_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
          [
            request.userId,
            id,
            source.id,
            source.url,
            source.title,
            source.kind,
            source.retrievedAt,
            source.publishedAt,
          ],
        );
      return id;
    });
  }
  private async finish(
    request: UnifiedRequest,
    write: (client: PoolClient) => Promise<string>,
  ) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const row = await client.query(
        "UPDATE messages SET status='complete',completed_at=now() WHERE id=$1 AND user_id=$2 AND conversation_id=$3 AND request_id=$4 AND status='running' RETURNING id",
        [
          request.messageId,
          request.userId,
          request.conversationId,
          request.requestId,
        ],
      );
      if (!row.rowCount) {
        await client.query("ROLLBACK");
        return null;
      }
      const id = await write(client);
      await client.query(
        "UPDATE conversations SET updated_at=now() WHERE id=$1 AND user_id=$2",
        [request.conversationId, request.userId],
      );
      await client.query("COMMIT");
      return id;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
  async fail(request: UnifiedRequest, code: string) {
    await this.pool.query(
      "UPDATE messages SET status='failed',error_code=$5,completed_at=now() WHERE id=$1 AND user_id=$2 AND conversation_id=$3 AND request_id=$4 AND status='running'",
      [
        request.messageId,
        request.userId,
        request.conversationId,
        request.requestId,
        code,
      ],
    );
  }
}
