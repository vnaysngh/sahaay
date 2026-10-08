import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";
import { verificationRequired } from "../../auth/email";
import { RequestError } from "../../core/validation";
const hash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export class TelegramStore {
  constructor(readonly pool: Pool) {}
  async issue(userId: string) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        userId,
      ]);
      await c.query("DELETE FROM telegram_link_codes WHERE expires_at<now()");
      const count = await c.query(
        "SELECT count(*)::int n FROM telegram_link_codes WHERE user_id=$1",
        [userId],
      );
      if (count.rows[0].n >= 5)
        throw new RequestError(
          429,
          "link_limit",
          "Wait ten minutes before creating another link.",
        );
      const token = randomBytes(32).toString("base64url");
      await c.query(
        "INSERT INTO telegram_link_codes(token_hash,user_id) VALUES($1,$2)",
        [hash(token), userId],
      );
      await c.query("COMMIT");
      return token;
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally {
      c.release();
    }
  }
  async link(telegramId: string, token: string) {
    if (!/^[a-zA-Z0-9_-]{43}$/.test(token))
      throw new RequestError(
        400,
        "link",
        "This link is invalid or expired. Create a fresh link in Web Chat.",
      );
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,2))", [
        telegramId,
      ]);
      const owner = (
        await c.query(
          "SELECT user_id FROM telegram_link_codes WHERE token_hash=$1 AND expires_at>now()",
          [hash(token)],
        )
      ).rows[0];
      if (!owner)
        throw new RequestError(
          400,
          "link",
          "This link is invalid or expired. Create a fresh link in Web Chat.",
        );
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        owner.user_id,
      ]);
      const code = (
        await c.query(
          "SELECT user_id FROM telegram_link_codes WHERE token_hash=$1 AND expires_at>now() FOR UPDATE",
          [hash(token)],
        )
      ).rows[0];
      if (!code)
        throw new RequestError(
          400,
          "link",
          "This link is invalid or expired. Create a fresh link in Web Chat.",
        );
      await c.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [
        code.user_id,
      ]);
      const existing = (
        await c.query(
          "SELECT user_id,telegram_user_id FROM telegram_links WHERE telegram_user_id=$1 OR user_id=$2",
          [telegramId, code.user_id],
        )
      ).rows;
      if (
        existing.some(
          (row) =>
            row.user_id !== code.user_id || row.telegram_user_id !== telegramId,
        )
      )
        throw new RequestError(
          409,
          "linked",
          "An account is already linked. Disconnect it from Web Chat first.",
        );
      await c.query(
        "INSERT INTO telegram_links(telegram_user_id,user_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
        [telegramId, code.user_id],
      );
      await c.query("DELETE FROM telegram_link_codes WHERE user_id=$1", [
        code.user_id,
      ]);
      await c.query("COMMIT");
      return code.user_id as string;
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally {
      c.release();
    }
  }
  async identity(telegramId: string) {
    return (
      await this.pool.query(
        'SELECT l.user_id,l.conversation_id,u.processing_paused FROM telegram_links l JOIN "user" u ON u.id=l.user_id WHERE l.telegram_user_id=$1 AND (NOT $2::boolean OR u.email_verified)',
        [telegramId, verificationRequired()],
      )
    ).rows[0] as
      | {
          user_id: string;
          conversation_id: string | null;
          processing_paused: boolean;
        }
      | undefined;
  }
  async conversation(telegramId: string, newConversation = false) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const owner = (
        await c.query(
          "SELECT user_id FROM telegram_links WHERE telegram_user_id=$1",
          [telegramId],
        )
      ).rows[0];
      if (!owner)
        throw new RequestError(403, "link", "Link your Sahaay account first.");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        owner.user_id,
      ]);
      const link = (
        await c.query(
          "SELECT user_id,conversation_id FROM telegram_links WHERE telegram_user_id=$1 FOR UPDATE",
          [telegramId],
        )
      ).rows[0];
      if (!link)
        throw new RequestError(403, "link", "Link your Sahaay account first.");
      let id = link.conversation_id as string | null;
      if (!id || newConversation) {
        id = (
          await c.query(
            "INSERT INTO conversations(user_id) VALUES($1) RETURNING id",
            [link.user_id],
          )
        ).rows[0].id;
        await c.query(
          "UPDATE telegram_links SET conversation_id=$2 WHERE telegram_user_id=$1",
          [telegramId, id],
        );
      }
      await c.query("COMMIT");
      return { userId: link.user_id as string, conversationId: id! };
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally {
      c.release();
    }
  }
  async disconnect(userId: string) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        userId,
      ]);
      const row = (
        await c.query(
          "DELETE FROM telegram_links WHERE user_id=$1 RETURNING conversation_id",
          [userId],
        )
      ).rows[0];
      await c.query("DELETE FROM telegram_link_codes WHERE user_id=$1", [
        userId,
      ]);
      if (row?.conversation_id)
        await c.query(
          "UPDATE messages SET status='interrupted',error_code='interrupted',completed_at=now() WHERE user_id=$1 AND conversation_id=$2 AND status='running'",
          [userId, row.conversation_id],
        );
      await c.query("COMMIT");
      return row?.conversation_id as string | undefined;
    } catch (error) {
      await c.query("ROLLBACK");
      throw error;
    } finally {
      c.release();
    }
  }
  async claim(botId: string, updateId: number, requestId: string) {
    await this.pool.query(
      "DELETE FROM telegram_updates WHERE created_at<now()-interval '30 days'",
    );
    return Boolean(
      (
        await this.pool.query(
          "INSERT INTO telegram_updates(bot_id,update_id,request_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING update_id",
          [botId, updateId, requestId],
        )
      ).rowCount,
    );
  }
  async receipt(botId: string, updateId: number) {
    return (
      await this.pool.query(
        "SELECT *,created_at<now()-interval '210 seconds' stale FROM telegram_updates WHERE bot_id=$1 AND update_id=$2",
        [botId, updateId],
      )
    ).rows[0];
  }
  async bind(
    botId: string,
    updateId: number,
    userId: string,
    conversationId: string | null,
  ) {
    await this.pool.query(
      "UPDATE telegram_updates SET user_id=$3,conversation_id=$4 WHERE bot_id=$1 AND update_id=$2",
      [botId, updateId, userId, conversationId],
    );
  }
  async reply(botId: string, updateId: number, replyId: number) {
    await this.pool.query(
      "UPDATE telegram_updates SET reply_id=$3 WHERE bot_id=$1 AND update_id=$2",
      [botId, updateId, replyId],
    );
  }
  async done(botId: string, updateId: number, state = "done") {
    await this.pool.query(
      "UPDATE telegram_updates SET state=$3 WHERE bot_id=$1 AND update_id=$2",
      [botId, updateId, state],
    );
  }
}
