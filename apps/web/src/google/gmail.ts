import { google } from "googleapis";
import { simpleParser } from "mailparser";
import MailComposer from "nodemailer/lib/mail-composer";
import type { OAuth2Client } from "google-auth-library";
import type { z } from "zod";
import { emailInput } from "@sahaay/api-client";
import { RequestError } from "../core/validation";
import { googleReadBackoff } from "./retry";
export const readOptions = {
  maxContentLength: 2000000,
  timeout: 15000,
  retry: true,
  retryConfig: {
    retry: 2,
    noResponseRetries: 1,
    httpMethodsToRetry: ["GET"],
    maxRetryDelay: 2000,
    retryBackoff: googleReadBackoff,
  },
};
export const writeOptions = {
  timeout: 15000,
  retry: false,
  retryConfig: { retry: 0 },
  maxContentLength: 2000000,
};
export async function parseMessage(raw: string) {
  if (raw.length > 750000)
    throw new RequestError(
      413,
      "gmail_size",
      "This email is too large to read in Sahaay.",
    );
  const bytes = Buffer.from(raw, "base64url");
  if (bytes.length > 512000)
    throw new RequestError(
      413,
      "gmail_size",
      "This email is too large to read in Sahaay.",
    );
  const parsed = await simpleParser(bytes, { maxHtmlLengthToParse: 64000 });
  const address = (v: typeof parsed.from) =>
    v?.value
      .map((a) => ({
        name: (a.name ?? "").slice(0, 200),
        address: a.address ?? "",
      }))
      .slice(0, 20) ?? [];
  const to = Array.isArray(parsed.to) ? parsed.to[0] : parsed.to;
  return {
    subject: (parsed.subject ?? "").slice(0, 500),
    from: address(parsed.from),
    to: address(to),
    body: (parsed.text ?? "").slice(0, 16000),
    truncated: (parsed.text?.length ?? 0) > 16000,
    date: parsed.date?.toISOString() ?? null,
    messageId: parsed.messageId ?? null,
    references: parsed.references ?? [],
    attachments: parsed.attachments.slice(0, 20).map((a) => ({
      filename: (a.filename ?? "attachment").slice(0, 200),
      mime: a.contentType,
      bytes: a.size,
    })),
  };
}
export class GmailService {
  private api;
  constructor(auth: OAuth2Client) {
    this.api = google.gmail({ version: "v1", auth });
  }
  async search(query: string, pageToken?: string) {
    if (query.length > 500 || (pageToken?.length ?? 0) > 1000)
      throw new RequestError(400, "gmail_query", "Use a shorter email search.");
    const { data } = await this.api.users.messages.list(
      { userId: "me", q: query, maxResults: 10, pageToken },
      readOptions,
    );
    return {
      messages: data.messages ?? [],
      nextPageToken: data.nextPageToken ?? null,
      estimatedTotal: data.resultSizeEstimate ?? 0,
    };
  }
  async get(id: string) {
    const { data } = await this.api.users.messages.get(
      { userId: "me", id, format: "raw" },
      readOptions,
    );
    if (!data.raw)
      throw new RequestError(
        404,
        "gmail_body",
        "Email content is unavailable.",
      );
    return {
      id: data.id,
      threadId: data.threadId,
      ...(await parseMessage(data.raw)),
    };
  }
  async thread(id: string) {
    // Metadata first avoids downloading an unbounded thread of message bodies.
    const { data } = await this.api.users.threads.get(
      { userId: "me", id, format: "metadata" },
      readOptions,
    );
    const messages = data.messages ?? [];
    const results = [];
    for (let offset = 0; offset < Math.min(messages.length, 8); offset += 2)
      results.push(
        ...(await Promise.all(
          messages
            .slice(offset, Math.min(offset + 2, 8))
            .map((m) => this.get(m.id!)),
        )),
      );
    return { id: data.id, messages: results, truncated: messages.length > 8 };
  }
  async compose(
    input: z.infer<typeof emailInput>,
    from: string,
    operationId: string,
    draft: boolean,
  ) {
    const message = emailInput.parse(input);
    const parent = message.replyMessageId
      ? await this.get(message.replyMessageId)
      : null;
    const raw = await new MailComposer({
      from,
      to: message.to,
      cc: message.cc,
      subject: message.subject,
      text: message.body,
      messageId: `<sahaay-${operationId}@sahaay.invalid>`,
      inReplyTo: parent?.messageId ?? undefined,
      references: parent?.messageId
        ? [
            ...(Array.isArray(parent.references)
              ? parent.references
              : [parent.references]),
            parent.messageId,
          ]
        : undefined,
    })
      .compile()
      .build();
    const resource = {
      raw: raw.toString("base64url"),
      threadId: parent?.threadId,
    };
    const data = draft
      ? (
          await this.api.users.drafts.create(
            { userId: "me", requestBody: { message: resource } },
            writeOptions,
          )
        ).data
      : (
          await this.api.users.messages.send(
            { userId: "me", requestBody: resource },
            writeOptions,
          )
        ).data;
    return {
      id: data.id ?? undefined,
      outcome: draft ? "draft_created" : "message_sent",
    };
  }
}
