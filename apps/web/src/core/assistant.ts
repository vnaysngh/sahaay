import type {
  AgentProvider,
  ConversationStore,
  ResponseEvent,
  UnifiedRequest,
} from "./contracts";
export async function* respond(
  request: UnifiedRequest,
  store: ConversationStore,
  provider: AgentProvider,
): AsyncGenerator<ResponseEvent> {
  yield { type: "processing", messageId: request.messageId, stage: "thinking" };
  try {
    const context = await store.context(
      request.userId,
      request.conversationId,
      request.messageId,
    );
    const signal = AbortSignal.timeout(120_000);
    let text = "";
    for await (const delta of provider.stream(context, {
      signal,
      responseLanguage: request.responseLanguage,
    })) {
      text += delta;
      if (text.length > 24_000) throw new Error("output_limit");
      yield { type: "delta", text: delta };
    }
    if (!text.trim()) throw new Error("empty_response");
    const id = await store.complete(request, text);
    if (!id) throw new Error("interrupted");
    yield { type: "complete", messageId: id, text };
  } catch (error) {
    const code =
      error instanceof Error &&
      ["TimeoutError", "AbortError"].includes(error.name)
        ? "timeout"
        : "response_failed";
    try {
      await store.fail(request, code);
    } catch {
      /* Do not expose database/provider errors; stale runs are reconciled. */
    }
    yield {
      type: "error",
      code,
      message:
        code === "timeout"
          ? "This response took too long. Please try again."
          : "Sahaay couldn’t finish this response. Please try again.",
    };
  }
}
