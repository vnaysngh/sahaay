import { expect, it } from "vitest";
import { SahaayClient, ApiError } from "../../packages/api-client/src";
const conversationId = "11111111-1111-4111-8111-111111111111",
  requestId = "22222222-2222-4222-8222-222222222222";
it("sends native session authentication without client ownership and validates streamed events across byte boundaries", async () => {
  const text =
      JSON.stringify({ type: "delta", text: "नमस्ते" }) +
      "\n" +
      JSON.stringify({
        type: "complete",
        messageId: conversationId,
        text: "नमस्ते",
      }) +
      "\n",
    bytes = new TextEncoder().encode(text);
  let calls = 0;
  const client = new SahaayClient({
    baseURL: "https://example.invalid",
    cookie: () => "better-auth.session_token=private",
    fetch: async (url, init) => {
      calls++;
      expect(url).toBe("https://example.invalid/api/chat");
      expect(new Headers(init?.headers).get("cookie")).toContain(
        "session_token=private",
      );
      expect(new Headers(init?.headers).get("origin")).toBe("sahaay://");
      expect(JSON.parse(String(init?.body))).not.toHaveProperty("userId");
      return new Response(
        new ReadableStream({
          start(c) {
            for (let i = 0; i < bytes.length; i += 3)
              c.enqueue(bytes.slice(i, i + 3));
            c.close();
          },
        }),
        { headers: { "content-type": "application/x-ndjson" } },
      );
    },
  });
  const events = [];
  for await (const e of client.chat({
    conversationId,
    requestId,
    text: "Hello",
    attachmentIds: [],
  }))
    events.push(e);
  expect(events).toHaveLength(2);
  expect(events[0]).toEqual({ type: "delta", text: "नमस्ते" });
  expect(calls).toBe(1);
});
it("does not replay an uncertain mutation or duplicate accepted chat", async () => {
  let calls = 0;
  const client = new SahaayClient({
    baseURL: "https://example.invalid",
    cookie: () => "",
    fetch: async () => {
      calls++;
      return Response.json(
        { duplicate: true, messageId: conversationId, status: "running" },
        { status: 202 },
      );
    },
  });
  for await (const e of client.chat({
    conversationId,
    requestId,
    text: "save",
    attachmentIds: [],
  }))
    expect.fail(JSON.stringify(e));
  expect(calls).toBe(1);
});
it("rejects malformed/truncated streams and insecure remote servers", async () => {
  expect(
    () =>
      new SahaayClient({ baseURL: "http://example.invalid", cookie: () => "" }),
  ).toThrow("HTTPS");
  const client = new SahaayClient({
    baseURL: "https://example.invalid",
    cookie: () => "",
    fetch: async () =>
      new Response('{"type":"delta","text":"partial"}', {
        headers: { "content-type": "application/x-ndjson" },
      }),
  });
  await expect(
    (async () => {
      for await (const e of client.chat({
        conversationId,
        requestId,
        text: "hi",
        attachmentIds: [],
      }))
        void e;
    })(),
  ).rejects.toThrow("ended early");
});
it("exposes authentication expiry and does not retry failed requests", async () => {
  let calls = 0,
    expired = false;
  const client = new SahaayClient({
    baseURL: "https://example.invalid",
    cookie: () => "",
    unauthorized: () => {
      expired = true;
    },
    fetch: async () => {
      calls++;
      return Response.json(
        { error: "Please sign in.", code: "unauthorized" },
        { status: 401 },
      );
    },
  });
  await expect(client.inbox()).rejects.toBeInstanceOf(ApiError);
  expect(expired).toBe(true);
  expect(calls).toBe(1);
});
