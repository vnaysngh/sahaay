import type { ConversationMessage } from "./contracts";
import type { Attachments } from "../media/attachments";
import type { TranscriptionProvider } from "../providers/transcription";
// Adapter dependencies are injected; no HTTP/UI/provider payload is part of the request contract.
export function mediaNormalizer(
  attachments: Pick<Attachments, "get" | "read" | "saveTranscript">,
  speech: TranscriptionProvider,
) {
  return async (
    context: ConversationMessage[],
    userId: string,
    signal: AbortSignal,
  ) => {
    let imageCount = 0;
    let characters = 0;
    const normalized: ConversationMessage[] = [];
    for (const message of [...context].reverse()) {
      const current: ConversationMessage = {
        role: message.role,
        content: message.content,
      };
      const images: Array<{ id: string; dataUrl: string }> = [];
      for (const reference of message.attachments ?? []) {
        const source = await attachments.get(userId, reference.id);
        if (source.kind === "audio") {
          let transcript = source.transcript;
          if (!transcript) {
            const { data } = await attachments.read(userId, source.id);
            const result = await speech.transcribe(data, signal);
            await attachments.saveTranscript(userId, source.id, result);
            transcript = result.text;
          }
          current.content += `\n[Voice transcript, attachment ${source.id}]: ${transcript}`;
        } else if (!source.available) {
          current.content +=
            "\n[Earlier image expired; original pixels are unavailable. Ask for a new upload if needed.]";
        } else if (imageCount < 6) {
          const { data } = await attachments.read(userId, source.id);
          images.push({
            id: source.id,
            dataUrl: `data:${source.mime};base64,${data.toString("base64")}`,
          });
          imageCount++;
        } else {
          current.content +=
            "\n[Earlier image omitted from bounded context; ask the user to re-upload if needed.]";
        }
      }
      if (images.length) current.images = images;
      if (characters + current.content.length > 24_000 && normalized.length)
        break;
      characters += current.content.length;
      normalized.unshift(current);
    }
    while (normalized[0]?.role === "assistant") normalized.shift();
    return normalized;
  };
}
