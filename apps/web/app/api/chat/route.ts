import { PostgresMemory } from "@/db/memory";
import { PostgresSavedItems } from "@/db/items";
import { getPool } from "@/db";
import { PostgresConversations } from "@/db/conversations";
import { respond } from "@/core/assistant";
import { messageInput, RequestError } from "@/core/validation";
import {
  requireUser,
  requireOrigin,
  readBody,
  errorResponse,
} from "@/channels/web/http";
import { Attachments } from "@/media/attachments";
import { mediaNormalizer } from "@/core/normalize";
import { createTranscriptionProvider } from "@/providers/transcription";
import { createAgentProvider } from "@/providers/openai";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser(request);
    const parsed = messageInput.safeParse(await readBody(request));
    if (!parsed.success)
      throw new RequestError(
        400,
        "input",
        "Send text (up to 4,000 characters), images or a voice clip to a valid conversation.",
      );
    const store = new PostgresConversations(getPool());
    const result = await store.begin(user.id, parsed.data);
    if (result.duplicate)
      return Response.json(
        { duplicate: true, messageId: result.messageId, status: result.status },
        { status: 202 },
      );
    const provider = createAgentProvider({
      memories: new PostgresMemory(getPool(), result.request),
      items: new PostgresSavedItems(getPool(), result.request),
    });
    let closed = false;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Keep the run durable to a browser disconnect; only the transport closes.
        for await (const event of respond(
          result.request,
          store,
          provider,
          mediaNormalizer(
            new Attachments(getPool()),
            createTranscriptionProvider(),
          ),
        )) {
          if (!closed) {
            try {
              controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
            } catch {
              closed = true;
            }
          }
        }
        if (!closed) {
          controller.close();
          closed = true;
        }
      },
      cancel() {
        closed = true;
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
