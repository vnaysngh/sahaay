import { formatResearchAnswer } from "./tools/research";
import type {
  AgentProvider,
  ConversationStore,
  ResponseEvent,
  UnifiedRequest,
  InputNormalizer,
  ResearchSource,
} from "./contracts";
export async function* respond(
  request: UnifiedRequest,
  store: ConversationStore,
  provider: AgentProvider,
  normalize?: InputNormalizer,
): AsyncGenerator<ResponseEvent> {
  yield {
    type: "processing",
    messageId: request.messageId,
    stage: request.inputs.some((i) => i.type === "audio")
      ? "transcribing"
      : request.inputs.some((i) => i.type === "image")
        ? "understanding"
        : "thinking",
  };
  let operations: string[] = [];
  try {
    let context = await store.context(
      request.userId,
      request.conversationId,
      request.messageId,
    );
    const signal = AbortSignal.timeout(180_000);
    if (normalize) {
      context = await normalize(context, request.userId, signal);
      yield {
        type: "processing",
        messageId: request.messageId,
        stage: "thinking",
      };
    }
    let text = "";
    let sources: ResearchSource[] = [];
    for await (const delta of provider.stream(context, {
      signal,
      request,
      responseLanguage: request.responseLanguage,
    })) {
      if (typeof delta !== "string") {
        if (delta.type === "researching")
          yield {
            type: "processing",
            messageId: request.messageId,
            stage: "researching",
          };
        else if (delta.type === "record_changes") operations = delta.operations;
        else sources = delta.sources;
        continue;
      }
      text += delta;
      if (text.length > 24_000) throw new Error("output_limit");
      yield { type: "delta", text: delta };
    }
    if (!text.trim()) throw new Error("empty_response");
    if (sources.length) {
      const formatted = formatResearchAnswer(text, sources);
      text = formatted.text;
      sources = formatted.sources;
    }
    const id = sources.length
      ? await store.complete(request, text, sources)
      : await store.complete(request, text);
    if (!id) throw new Error("interrupted");
    if (sources.length) yield { type: "sources", sources };
    yield { type: "complete", messageId: id, text };
  } catch (error) {
    if (operations.length) {
      const labels: Record<string, string> = {
        remember: "Memory saved",
        update_memory: "Memory corrected",
        forget: "Memory forgotten",
        save: "Item saved",
        update_item: "Item updated",
        remove_item: "Item removed",
      };
      const text =
        [...new Set(operations)]
          .map((op) => labels[op] ?? "Record changed")
          .join(". ") +
        ". The rest of this response could not be completed. These changes are already committed; you can ask to see them.";
      try {
        const id = await store.complete(request, text);
        if (id) {
          yield { type: "complete", messageId: id, text };
          return;
        }
      } catch {
        /* Fall through to reconciliation. */
      }
    }
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
