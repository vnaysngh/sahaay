import { describe, it, expect, vi } from "vitest";
import { respond } from "../../apps/web/src/core/assistant";
import type {
  AgentProvider,
  ConversationStore,
  ResponseEvent,
  UnifiedRequest,
} from "../../apps/web/src/core/contracts";
import { messageInput } from "../../apps/web/src/core/validation";
const request: UnifiedRequest = {
  userId: "owner",
  conversationId: "conversation",
  requestId: "request",
  messageId: "message",
  inputs: [{ type: "text", text: "hi" }],
  receivedAt: new Date().toISOString(),
};
function store(): ConversationStore {
  return {
    context: vi.fn().mockResolvedValue([{ role: "user", content: "hi" }]),
    complete: vi.fn().mockResolvedValue("answer"),
    fail: vi.fn().mockResolvedValue(undefined),
  };
}
async function collect(iterable: AsyncIterable<ResponseEvent>) {
  const events = [];
  for await (const event of iterable) events.push(event);
  return events;
}
describe("one core pipeline", () => {
  it("streams incremental text and commits only the complete answer", async () => {
    const db = store();
    const provider: AgentProvider = {
      async *stream(context) {
        expect(context).toEqual([{ role: "user", content: "hi" }]);
        yield "Hello";
        yield " there";
      },
    };
    const events = await collect(respond(request, db, provider));
    expect(events.map((e) => e.type)).toEqual([
      "processing",
      "delta",
      "delta",
      "complete",
    ]);
    expect(db.complete).toHaveBeenCalledWith(request, "Hello there");
    expect(db.fail).not.toHaveBeenCalled();
  });
  it("does not save a partial answer or leak a provider error", async () => {
    const db = store();
    const provider: AgentProvider = {
      async *stream() {
        yield "partial";
        throw new Error("secret API token sk-example");
      },
    };
    const events = await collect(respond(request, db, provider));
    expect(events.at(-1)?.type).toBe("error");
    expect(JSON.stringify(events)).not.toContain("sk-example");
    expect(db.complete).not.toHaveBeenCalled();
    expect(db.fail).toHaveBeenCalled();
  });
  it("marks empty or stale responses as failures", async () => {
    const db = store();
    vi.mocked(db.complete).mockResolvedValue(null);
    const events = await collect(
      respond(request, db, {
        async *stream() {
          yield "old response";
        },
      }),
    );
    expect(events.at(-1)?.type).toBe("error");
  });
  it("validates text limits, whitespace and client request IDs", () => {
    const valid = {
      conversationId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      text: " hi ",
    };
    expect(messageInput.parse(valid).text).toBe("hi");
    for (const text of [" ", "x".repeat(4001)])
      expect(messageInput.safeParse({ ...valid, text }).success).toBe(false);
    expect(
      messageInput.safeParse({ ...valid, userId: "someone-else" }).success,
    ).toBe(false);
  });
});

it("reports committed changes independently when the remainder fails", async () => {
  const db = store();
  const provider: AgentProvider = {
    async *stream() {
      yield { type: "record_changes", operations: ["save"] };
      throw Error("research outage with private details");
    },
  };
  const events = await collect(respond(request, db, provider));
  expect(events.at(-1)).toMatchObject({
    type: "complete",
    text: expect.stringContaining("Item saved. The rest"),
  });
  expect(db.fail).not.toHaveBeenCalled();
  expect(JSON.stringify(events)).not.toContain("private details");
});
