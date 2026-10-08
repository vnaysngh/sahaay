import { renderTelegram, type TelegramEntity } from "./output";
export class TelegramApiError extends Error {
  constructor(
    readonly code: number,
    readonly retryAfter = 0,
    readonly uncertain = false,
    readonly notModified = false,
  ) {
    super("Telegram transport unavailable");
  }
}
export class TelegramApi {
  constructor(
    private token: string,
    private transport: typeof fetch = fetch,
  ) {}
  async call<T>(
    method: string,
    body: Record<string, unknown> | FormData,
    timeout = 15000,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.transport(
        `https://api.telegram.org/bot${this.token}/${method}`,
        {
          method: "POST",
          headers:
            body instanceof FormData
              ? undefined
              : { "Content-Type": "application/json" },
          body: body instanceof FormData ? body : JSON.stringify(body),
          signal: AbortSignal.timeout(timeout),
          redirect: "error",
          cache: "no-store",
        },
      );
    } catch {
      throw new TelegramApiError(0, 0, true);
    }
    let result: {
      ok: boolean;
      result: T;
      error_code?: number;
      description?: string;
      parameters?: { retry_after?: number };
    };
    try {
      result = await response.json();
    } catch {
      throw new TelegramApiError(response.status, 0, true);
    }
    if (!response.ok || !result.ok)
      throw new TelegramApiError(
        result.error_code ?? response.status,
        Math.min(result.parameters?.retry_after ?? 0, 300),
        response.status >= 500,
        method === "editMessageText" &&
          (result.description?.includes("message is not modified") ?? false),
      );
    return result.result;
  }
  sendOriginal(chatId: number, data: Buffer, mime: string, title: string) {
    const form = new FormData();
    form.set("chat_id", String(chatId));
    form.set("caption", title);
    const extension =
      mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    form.set(
      "document",
      new Blob([new Uint8Array(data)], { type: mime }),
      `document.${extension}`,
    );
    return this.call<{ message_id: number }>("sendDocument", form);
  }
  send(chatId: number, text: string, entities?: TelegramEntity[]) {
    const rendered = entities ? { text, entities } : renderTelegram(text);
    return this.call<{ message_id: number }>("sendMessage", {
      chat_id: chatId,
      ...rendered,
      link_preview_options: { is_disabled: true },
    });
  }
  async edit(
    chatId: number,
    messageId: number,
    text: string,
    entities?: TelegramEntity[],
  ) {
    const rendered = entities ? { text, entities } : renderTelegram(text);
    try {
      return await this.call("editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        ...rendered,
        link_preview_options: { is_disabled: true },
      });
    } catch (error) {
      if (error instanceof TelegramApiError && error.notModified) return true;
      throw error;
    }
  }
  async download(fileId: string): Promise<Buffer> {
    const file = await this.call<{ file_path?: string; file_size?: number }>(
      "getFile",
      { file_id: fileId },
    );
    if (
      !file.file_path ||
      !/^[a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+$/.test(file.file_path) ||
      file.file_path.split("/").includes("..") ||
      (file.file_size ?? 0) > 8 * 1024 * 1024
    )
      throw Error("Unsupported or oversized Telegram file");
    const response = await this.transport(
      `https://api.telegram.org/file/bot${this.token}/${file.file_path}`,
      {
        signal: AbortSignal.timeout(30000),
        redirect: "error",
        cache: "no-store",
      },
    );
    if (!response.ok || !response.body)
      throw Error("Telegram file unavailable");
    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 8 * 1024 * 1024) throw Error("Telegram file too large");
        chunks.push(value);
      }
    } finally {
      await reader.cancel();
      reader.releaseLock();
    }
    return Buffer.concat(chunks);
  }
}
