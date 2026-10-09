import { z } from "zod";
const id = z.string().uuid();
export const sourceSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  title: z.string(),
  kind: z.enum(["cited", "consulted"]),
  retrievedAt: z.string(),
  publishedAt: z.string().nullable(),
});
const artifactRef = z.object({ id, title: z.string() });
export const eventSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("processing"),
    messageId: id,
    stage: z.enum(["thinking", "understanding", "transcribing", "researching"]),
  }),
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({ type: z.literal("sources"), sources: z.array(sourceSchema) }),
  z.object({ type: z.literal("artifacts"), artifacts: z.array(artifactRef) }),
  z.object({ type: z.literal("complete"), messageId: id, text: z.string() }),
  z.object({ type: z.literal("error"), code: z.string(), message: z.string() }),
]);
export type ResponseEvent = z.infer<typeof eventSchema>;
export const messageSchema = z.object({
  id,
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  status: z.string(),
  requestId: id,
  createdAt: z.string(),
  sources: z.array(sourceSchema).optional(),
  artifacts: z.array(artifactRef).optional(),
  attachments: z
    .array(
      z.object({
        id,
        kind: z.enum(["image", "audio"]),
        filename: z.string(),
        available: z.boolean(),
      }),
    )
    .optional(),
});
export type Message = z.infer<typeof messageSchema>;
export const conversationSchema = z.object({
  id,
  title: z.string(),
  updatedAt: z.string(),
});
export const artifactSchema = z.object({
  id,
  title: z.string(),
  category: z.string(),
  mime: z.string(),
  bytes: z.number(),
  relatedItemId: id.nullable(),
  createdAt: z.string(),
  version: z.number().int().positive(),
});
export const documentSchema = artifactSchema.extend({
  description: z.string(),
  extractedText: z.string(),
  metadata: z.array(z.object({ key: z.string(), value: z.string() })),
});
export const recordSchema = z.object({
  id,
  content: z.string(),
  kind: z.string(),
  url: z.string().nullable(),
  recordRole: z.enum(["item", "object"]),
  parentId: id.nullable(),
  stateLabel: z.string().nullable(),
  structuredValue: z
    .record(
      z.string(),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .nullable(),
  status: z.enum(["saved", "done", "archived"]),
  listLabel: z.string().nullable(),
  updatedAt: z.string(),
  itemCount: z.number().int(),
  total: z.number().int(),
});
export const stateSchema = z.object({
  parent: z
    .object({
      id,
      content: z.string(),
      kind: z.string(),
      stateLabel: z.string().nullable(),
    })
    .passthrough()
    .nullable(),
  records: z.array(recordSchema),
  memories: z.array(z.object({ id, content: z.string() })),
  hasNext: z.boolean(),
  page: z.number().int(),
});
export const followupSchema = z.object({
  id,
  reason: z.string(),
  relatedItemId: id.nullable(),
  relatedTitle: z.string().nullable(),
  relatedObjectId: id.nullable(),
  scheduledFor: z.string(),
  timezone: z.string(),
  status: z.string(),
  deliveryStatus: z.string(),
  version: z.number().int(),
  openedAt: z.string().nullable(),
  deliveredAt: z.string().nullable(),
  createdAt: z.string(),
});
export const inboxSchema = z.object({
  timezone: z.string().nullable(),
  now: z.string(),
  recent: z.array(followupSchema),
});
export type Followup = z.infer<typeof followupSchema>;
export type ChatInput = {
  conversationId: string;
  requestId: string;
  text: string;
  attachmentIds: string[];
};
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export type Transport = {
  baseURL: string;
  cookie: () => Promise<string> | string;
  fetch?: typeof fetch;
  unauthorized?: () => void;
  origin?: string;
};
export class SahaayClient {
  private fetcher: typeof fetch;
  constructor(private transport: Transport) {
    const u = new URL(transport.baseURL);
    if (
      u.protocol !== "https:" &&
      !["localhost", "127.0.0.1", "10.0.2.2"].includes(u.hostname)
    )
      throw new Error("Use an HTTPS backend URL.");
    this.fetcher = transport.fetch ?? fetch;
  }
  async request(path: string, init: RequestInit = {}, signal?: AbortSignal) {
    if (!path.startsWith("/api/") || path.includes(".."))
      throw new Error("Invalid API path");
    const headers = new Headers(init.headers);
    headers.set("Cookie", await this.transport.cookie());
    headers.set("Origin", this.transport.origin ?? "sahaay://");
    const timeout = AbortSignal.timeout(200000);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    const response = await this.fetcher(
      this.transport.baseURL.replace(/\/$/, "") + path,
      { ...init, headers, credentials: "omit", signal: combined },
    );
    if (!response.ok) {
      if (response.status === 401) this.transport.unauthorized?.();
      let data: { code?: string; error?: string } = {};
      try {
        data = await response.json();
      } catch {}
      throw new ApiError(
        response.status,
        data.code ?? "request_failed",
        data.error ?? "Unable to complete this request.",
      );
    }
    return response;
  }
  async json<T>(
    path: string,
    schema: z.ZodType<T>,
    body?: unknown,
    method = body === undefined ? "GET" : "POST",
    signal?: AbortSignal,
  ) {
    const r = await this.request(
      path,
      {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(body),
            }),
      },
      signal,
    );
    return schema.parse(await r.json());
  }
  async event(
    event:
      | "mobile_app_opened"
      | "mobile_login_completed"
      | "mobile_chat_started"
      | "mobile_message_sent"
      | "mobile_share_received"
      | "mobile_share_completed"
      | "mobile_artifact_opened"
      | "mobile_saved_item_opened"
      | "mobile_followup_opened"
      | "mobile_followup_completed",
    eventId: string,
  ) {
    await this.request("/api/mobile/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, eventId: id.parse(eventId) }),
    });
  }
  conversations() {
    return this.json("/api/conversations", z.array(conversationSchema));
  }
  createConversation() {
    return this.json("/api/conversations", conversationSchema, {});
  }
  history(conversationId: string) {
    return this.json(
      `/api/conversations/${id.parse(conversationId)}`,
      z.array(messageSchema),
    );
  }
  state(page = 0, objectId?: string) {
    return this.json(
      `/api/state?page=${Math.max(0, Math.floor(page))}${objectId ? "&object=" + id.parse(objectId) : ""}`,
      stateSchema,
    );
  }
  documents(query = "") {
    return this.json(
      "/api/documents?q=" + encodeURIComponent(query),
      z.array(artifactSchema),
    );
  }
  document(documentId: string) {
    return this.json("/api/documents/" + id.parse(documentId), documentSchema);
  }
  original(documentId: string, signal?: AbortSignal) {
    return this.request(
      "/api/documents/" + id.parse(documentId) + "/original",
      {},
      signal,
    );
  }
  async deleteDocument(documentId: string, version: number) {
    await this.request("/api/documents/" + id.parse(documentId), {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ version }),
    });
  }
  inbox() {
    return this.json("/api/inbox", inboxSchema);
  }
  inboxAction(body: unknown) {
    return this.json("/api/inbox", z.unknown(), body);
  }
  async upload(bytes: Uint8Array, filename: string, signal?: AbortSignal) {
    if (bytes.byteLength > 8388608)
      throw new Error("Choose an image or recording smaller than 8 MB.");
    const r = await this.request(
      "/api/attachments",
      {
        method: "POST",
        headers: { "x-file-name": encodeURIComponent(filename) },
        body: bytes as unknown as BodyInit,
      },
      signal,
    );
    return z
      .object({ id, kind: z.enum(["image", "audio"]) })
      .parse(await r.json());
  }
  async *chat(
    input: ChatInput,
    signal?: AbortSignal,
  ): AsyncGenerator<ResponseEvent> {
    const r = await this.request(
      "/api/chat",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-sahaay-channel": "mobile",
        },
        body: JSON.stringify(input),
      },
      signal,
    );
    if (r.status === 202) {
      z.object({
        duplicate: z.literal(true),
        messageId: id,
        status: z.string(),
      }).parse(await r.json());
      return;
    }
    if (!r.headers.get("content-type")?.startsWith("application/x-ndjson"))
      throw new Error("Invalid response stream");
    if (!r.body)
      throw new Error(
        "Streaming is unavailable. Reopen the conversation to check the result.",
      );
    const reader = r.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        if (buffer.length > 100000)
          throw new Error("Response frame exceeded its limit");
        let end;
        while ((end = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, end);
          buffer = buffer.slice(end + 1);
          if (line.trim()) yield eventSchema.parse(JSON.parse(line));
        }
        if (done) {
          if (buffer.trim())
            throw new Error(
              "Response stream ended early. Check conversation history.",
            );
          break;
        }
      }
    } finally {
      await reader.cancel().catch(() => {});
      reader.releaseLock();
    }
  }
}
