import "./env";
import {
  TelegramApi,
  TelegramApiError,
} from "../apps/web/src/channels/telegram/api";
import type { TelegramUpdate } from "../apps/web/src/channels/telegram/input";
import { setTimeout as delay } from "node:timers/promises";
async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !/^\d+:[a-zA-Z0-9_-]+$/.test(token))
    throw Error(
      "Add TELEGRAM_BOT_TOKEN and TELEGRAM_BOT_USERNAME to .env first.",
    );
  const endpoint = new URL(
    process.env.TELEGRAM_ADAPTER_URL ?? "http://127.0.0.1:3000/api/telegram",
  );
  if (
    endpoint.protocol !== "https:" &&
    !(
      endpoint.protocol === "http:" &&
      ["localhost", "127.0.0.1"].includes(endpoint.hostname)
    )
  )
    throw Error("Telegram bridge requires HTTPS or loopback HTTP.");
  if (
    endpoint.username ||
    endpoint.password ||
    endpoint.pathname !== "/api/telegram" ||
    endpoint.search
  )
    throw Error("Invalid Telegram bridge endpoint.");
  const api = new TelegramApi(token),
    bot = await api.call<{ id: number; username?: string }>("getMe", {});
  if (bot.username !== process.env.TELEGRAM_BOT_USERNAME)
    throw Error("TELEGRAM_BOT_USERNAME does not match the configured bot.");
  const webhook = await api.call<{ url: string }>("getWebhookInfo", {});
  if (webhook.url)
    throw Error(
      "This bot has a webhook configured. Remove it explicitly before running long polling.",
    );
  let offset = 0,
    stopping = false;
  process.on("SIGINT", () => {
    stopping = true;
  });
  process.on("SIGTERM", () => {
    stopping = true;
  });
  console.log(
    "Telegram polling started. Private linked chats only; Web Chat remains supported.",
  );
  while (!stopping) {
    let stage = "polling";
    try {
      const updates = await api.call<TelegramUpdate[]>(
        "getUpdates",
        { offset, limit: 10, timeout: 20, allowed_updates: ["message"] },
        30000,
      );
      for (const update of updates) {
        if (stopping) break;
        stage = "local bridge";
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(update),
          redirect: "error",
          signal: AbortSignal.timeout(360000),
        });
        if (!response.ok && response.status !== 400)
          throw Error(`Local Telegram bridge HTTP ${response.status}`);
        offset = update.update_id + 1;
        stage = "polling";
      }
    } catch (error) {
      if (stopping) break;
      if (error instanceof TelegramApiError && error.code === 409)
        throw Error(
          "Another Telegram poller or webhook is active. Run only one polling process for this bot.",
        );
      const detail =
        error instanceof TelegramApiError
          ? `Telegram API ${error.code || "network timeout"}`
          : error instanceof Error &&
              /^Local Telegram bridge HTTP \d{3}$/.test(error.message)
            ? error.message
            : "connection unavailable";
      console.error(
        `Telegram ${stage}: ${detail}; retrying without logging message content or credentials.`,
      );
      await delay(
        error instanceof TelegramApiError && error.retryAfter
          ? error.retryAfter * 1000
          : 3000,
      );
    }
  }
  console.log("Telegram polling stopped.");
}
main().catch((error) => {
  console.error(
    error instanceof Error &&
      /^(Add TELEGRAM|TELEGRAM_BOT_USERNAME|This bot has|Telegram bridge|Invalid Telegram|Another Telegram poller)/.test(
        error.message,
      )
      ? error.message
      : "Telegram startup failed. Check bot settings and local adapter availability.",
  );
  process.exitCode = 1;
});
