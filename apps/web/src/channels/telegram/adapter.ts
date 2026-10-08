import type { Pool } from "pg";
import { TelegramStore } from "./store";
import { TelegramApi, TelegramApiError } from "./api";
import { inputFor, requestId, type TelegramUpdate } from "./input";
import {
  telegramMessages,
  truncateTelegramMessage,
  splitAnswer,
} from "./output";
import { startSahaay, sahaayEvents } from "../../core/runtime";
import { PostgresArtifacts } from "../../db/artifacts";
import { Attachments } from "../../media/attachments";
import { PostgresPrivacy } from "../../db/privacy";
import { cancelRuns } from "../../core/runs";
import { RequestError } from "../../core/validation";
import type { ResearchSource } from "../../core/contracts";
export class TelegramAdapter {
  private store: TelegramStore;
  constructor(
    private pool: Pool,
    private api: TelegramApi,
    private botId: string,
    private webOrigin: string,
  ) {
    this.store = new TelegramStore(pool);
  }
  async handle(update: TelegramUpdate) {
    const m = update.message;
    // Only private messages from the actual chat owner; no groups/forwarded identity claims.
    if (
      !m ||
      m.chat.type !== "private" ||
      m.from.is_bot ||
      m.chat.id !== m.from.id
    )
      return;
    const tid = String(m.from.id),
      rid = requestId(this.botId, update.update_id);
    if (!(await this.store.claim(this.botId, update.update_id, rid))) {
      const old = await this.store.receipt(this.botId, update.update_id);
      if (old?.state === "processing" && old.stale && old.reply_id) {
        const link = await this.store.identity(tid);
        if (
          link &&
          link.user_id === old.user_id &&
          !link.processing_paused &&
          old.conversation_id
        ) {
          const result = (
            await this.pool.query(
              "SELECT content FROM messages WHERE user_id=$1 AND request_id=$2 AND role='assistant' AND status='complete'",
              [old.user_id, rid],
            )
          ).rows[0];
          const text = result
            ? splitAnswer(result.content)[0].slice(0, 3500) +
              `\n\nSaved conversation: ${this.webOrigin}`
            : "This request was interrupted. Ask again when ready; I haven’t automatically repeated it.";
          await this.api.edit(
            m.chat.id,
            Number(old.reply_id),
            splitAnswer(text)[0],
          );
        }
        await this.store.done(this.botId, update.update_id, "interrupted");
      }
      return;
    }
    let replyId: number | undefined;
    const pendingUploads: Array<{ owner: string; id: string }> = [];
    try {
      const text = m.forward_origin || m.via_bot ? "" : (m.text ?? "");
      if (text.startsWith("/start ") && !m.forward_origin && !m.via_bot) {
        const owner = await this.store.link(tid, text.slice(7).trim());
        await this.store.bind(this.botId, update.update_id, owner, null);
        await this.api.send(
          m.chat.id,
          "Linked to your Sahaay account. Send text, an image, voice or a URL. Your existing memories and saved items are available. /new starts a fresh conversation; /privacy shows controls.",
        );
        await this.store.done(this.botId, update.update_id);
        return;
      }
      const link = await this.store.identity(tid);
      if (!link) {
        await this.api.send(
          m.chat.id,
          `Connect your Sahaay account first: ${this.webOrigin}/connect/telegram\nSign in, generate a single-use link, then open it in Telegram.`,
        );
        await this.store.done(this.botId, update.update_id);
        return;
      }
      await this.store.bind(
        this.botId,
        update.update_id,
        link.user_id,
        link.conversation_id,
      );
      if (text === "/start" || text === "/help" || text === "/privacy") {
        await this.api.send(
          m.chat.id,
          `Text, images, voice and URLs use the same Sahaay assistant.\n/new — fresh conversation\n/pause or /resume — pause/resume your account\n/deletechat confirm — delete this conversation (saved facts/items remain)\nAccount deletion, history and disconnect: ${this.webOrigin}\nData use: ${this.webOrigin}/privacy\nTelegram retains its own chat copies; deleting Sahaay data does not erase those.`,
        );
      } else if (text === "/pause" || text === "/resume") {
        await new PostgresPrivacy(this.pool).change(link.user_id, {
          target: "pause",
          paused: text === "/pause",
        });
        if (text === "/pause") cancelRuns(link.user_id);
        await this.api.send(
          m.chat.id,
          text === "/pause"
            ? "Sahaay is paused across your channels. Use /resume when ready."
            : "Sahaay is ready again.",
        );
      } else if (text === "/new") {
        await this.store.conversation(tid, true);
        await this.api.send(
          m.chat.id,
          "Fresh conversation. Your memories and saved items remain available.",
        );
      } else if (text.startsWith("/deletechat")) {
        if (text !== "/deletechat confirm")
          await this.api.send(
            m.chat.id,
            "To delete this Telegram conversation and its media, send /deletechat confirm. Separately remembered facts and saved items remain.",
          );
        else {
          if (link.conversation_id) {
            await new PostgresPrivacy(this.pool).change(link.user_id, {
              target: "conversation",
              id: link.conversation_id,
            });
            cancelRuns(link.user_id, link.conversation_id);
          }
          await this.api.send(
            m.chat.id,
            "Conversation deleted from Sahaay. Telegram’s chat copy remains under Telegram’s controls.",
          );
        }
      } else {
        if (link.processing_paused)
          throw new RequestError(
            403,
            "paused",
            "Sahaay is paused. Use /resume to continue.",
          );
        if (text.startsWith("/"))
          throw new RequestError(
            400,
            "command",
            "Unknown command. Use /help or send a normal message.",
          );
        const input = inputFor(m),
          identity = await this.store.conversation(tid);
        await this.store.bind(
          this.botId,
          update.update_id,
          identity.userId,
          identity.conversationId,
        );
        replyId = (
          await this.api.send(
            m.chat.id,
            input.fileId ? "Understanding your message…" : "Thinking…",
          )
        ).message_id;
        await this.store.reply(this.botId, update.update_id, replyId);
        const attachments = new Attachments(this.pool),
          ids: string[] = [];
        if (input.fileId) {
          const data = await this.api.download(input.fileId);
          ids.push(
            (await attachments.upload(identity.userId, data, input.filename))
              .id,
          );
          pendingUploads.push({ owner: identity.userId, id: ids[0] });
        }
        const started = await startSahaay(identity.userId, {
          conversationId: identity.conversationId,
          requestId: rid,
          text: input.text,
          channel: "telegram",
          attachmentIds: ids,
        });
        if (started.duplicate)
          throw new RequestError(
            409,
            "duplicate",
            "This request already exists. Check your saved conversation in Web Chat.",
          );
        pendingUploads.length = 0;
        let final = "",
          sources: ResearchSource[] = [],
          originals: Array<{ id: string; title: string }> = [],
          lastStage = "";
        for await (const event of sahaayEvents(started.request)) {
          if (event.type === "processing" && event.stage !== lastStage) {
            lastStage = event.stage;
            // Stage edits are cosmetic; transport failure must not repeat a committed tool action.
            try {
              await this.api.edit(
                m.chat.id,
                replyId,
                event.stage === "researching"
                  ? "Researching…"
                  : event.stage === "transcribing"
                    ? "Transcribing…"
                    : event.stage === "understanding"
                      ? "Understanding…"
                      : "Thinking…",
              );
            } catch {
              /* Keep processing through the shared core. */
            }
          } else if (event.type === "artifacts") originals = event.artifacts;
          else if (event.type === "sources") sources = event.sources;
          else if (event.type === "complete") final = event.text;
          else if (event.type === "error") final = event.message;
        }
        const current = await this.store.identity(tid);
        const active = (
          await this.pool.query(
            "SELECT id FROM conversations WHERE id=$1 AND user_id=$2",
            [identity.conversationId, identity.userId],
          )
        ).rowCount;
        if (
          !current ||
          current.user_id !== identity.userId ||
          current.processing_paused ||
          !active
        ) {
          await this.api.edit(
            m.chat.id,
            replyId,
            "Processing stopped. Your privacy change has been applied.",
          );
          await this.store.done(this.botId, update.update_id, "interrupted");
          return;
        }
        const parts = telegramMessages(
          final ||
            "This request was interrupted. Check Web Chat before trying again.",
          sources,
        );
        if (parts.length > 8) {
          parts.length = 8;
          parts[7] = truncateTelegramMessage(
            parts[7],
            3500,
            `\n\nFull answer and sources in Web Chat: ${this.webOrigin}`,
          );
        }
        await this.api.edit(
          m.chat.id,
          replyId,
          parts[0].text,
          parts[0].entities,
        );
        for (const part of parts.slice(1))
          await this.api.send(m.chat.id, part.text, part.entities);
        for (const original of originals.slice(0, 3)) {
          const c = await this.pool.connect();
          try {
            await c.query("BEGIN");
            await c.query(
              "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
              [identity.userId],
            );
            const linked = await this.store.identity(tid);
            if (
              !linked ||
              linked.user_id !== identity.userId ||
              linked.processing_paused
            ) {
              await c.query("ROLLBACK");
              break;
            }
            const file = await new PostgresArtifacts(
              this.pool,
              started.request,
            ).getOriginal(identity.userId, original.id);
            await this.api.sendOriginal(
              m.chat.id,
              file.data,
              file.artifact.mime,
              file.artifact.title,
            );
            await c.query("COMMIT");
          } catch (e) {
            await c.query("ROLLBACK");
            throw e;
          } finally {
            c.release();
          }
        }
      }
      await this.store.done(this.botId, update.update_id);
    } catch (error) {
      if (error instanceof TelegramApiError) {
        await this.store.done(this.botId, update.update_id, "delivery_unknown");
        throw error;
      }
      const safe =
        error instanceof RequestError
          ? error.message
          : error instanceof Error &&
              /^(Messages must|Documents\/PDFs|Voice clips must|Files must|Send text|Send the recording)/.test(
                error.message,
              )
            ? error.message
            : "Sahaay couldn’t process this message. Try again or check Web Chat.";
      try {
        if (replyId) await this.api.edit(m.chat.id, replyId, safe);
        else await this.api.send(m.chat.id, safe);
      } catch {
        await this.store.done(this.botId, update.update_id, "delivery_unknown");
        return;
      }
      await this.store.done(this.botId, update.update_id, "interrupted");
    } finally {
      for (const upload of pendingUploads) {
        try {
          await new Attachments(this.pool).remove(upload.owner, upload.id);
        } catch {
          /* Owned orphan cleanup handles concurrent deletion. */
        }
      }
    }
  }
}
