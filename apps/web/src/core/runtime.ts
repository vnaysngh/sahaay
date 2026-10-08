import { getPool } from "../db";
import { PostgresConversations } from "../db/conversations";
import { PostgresArtifacts } from "../db/artifacts";
import { PostgresFollowups } from "../db/followups";
import { PostgresMemory } from "../db/memory";
import { PostgresSavedItems } from "../db/items";
import { Attachments } from "../media/attachments";
import { mediaNormalizer } from "./normalize";
import { createTranscriptionProvider } from "../providers/transcription";
import { createAgentProvider } from "../providers/openai";
import { registerRun } from "./runs";
import { recordEvent, recordUnsupportedAction } from "../db/events";
import { respond } from "./assistant";
import type { UnifiedRequest } from "./contracts";
export async function startSahaay(
  userId: string,
  input: {
    conversationId: string;
    requestId: string;
    text: string;
    attachmentIds?: string[];
    channel?: "web" | "telegram";
  },
) {
  const result = await new PostgresConversations(getPool()).begin(
    userId,
    input,
  );
  if (!result.duplicate)
    (result.request as UnifiedRequest).channel = input.channel ?? "web";
  return result;
}
// Both transports execute the same owned request, agent, normalization and tools.
export async function* sahaayEvents(request: UnifiedRequest) {
  const pool = getPool(),
    store = new PostgresConversations(pool);
  const provider = createAgentProvider({
    artifacts: new PostgresArtifacts(pool, request),
    followups: new PostgresFollowups(pool),
    memories: new PostgresMemory(pool, request),
    items: new PostgresSavedItems(pool, request),
    unsupportedAction: (category, capability) =>
      recordUnsupportedAction(pool, request, category, capability),
    conversationHistory: (conversationId) =>
      store.recallHistory(request.userId, conversationId),
  });
  const run = registerRun(
    request.userId,
    request.conversationId,
    request.requestId,
  );
  try {
    try {
      await recordEvent(pool, request, "started");
    } catch {
      console.error("Product event unavailable");
    }
    for await (const event of respond(
      request,
      store,
      provider,
      mediaNormalizer(new Attachments(pool), createTranscriptionProvider()),
      run.signal,
    )) {
      if (event.type === "complete" || event.type === "error") {
        try {
          await recordEvent(
            pool,
            request,
            event.type === "complete" ? "complete" : "failed",
            event.type === "error" ? event.code : undefined,
          );
        } catch {
          console.error("Product event unavailable");
        }
      }
      yield event;
    }
  } finally {
    run.close();
  }
}
