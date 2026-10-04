export type ConversationMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: Array<{ id: string; kind: "image" | "audio" }>;
  images?: Array<{ id: string; dataUrl: string }>;
};
export type UnifiedRequest = {
  userId: string;
  conversationId: string;
  requestId: string;
  messageId: string;
  inputs: Array<
    | { type: "text"; text: string }
    | { type: "image" | "audio"; attachmentId: string }
  >;
  receivedAt: string;
  responseLanguage?: string;
};
export type ResponseEvent =
  | {
      type: "processing";
      messageId: string;
      stage: "thinking" | "understanding" | "transcribing";
    }
  | { type: "delta"; text: string }
  | { type: "complete"; messageId: string; text: string }
  | { type: "error"; code: string; message: string };
export interface AgentProvider {
  stream(
    context: ConversationMessage[],
    options: { signal: AbortSignal; responseLanguage?: string },
  ): AsyncIterable<string>;
}
export interface ConversationStore {
  context(
    userId: string,
    conversationId: string,
    messageId: string,
  ): Promise<ConversationMessage[]>;
  complete(request: UnifiedRequest, text: string): Promise<string | null>;
  fail(request: UnifiedRequest, code: string): Promise<void>;
}

export type InputNormalizer = (
  context: ConversationMessage[],
  userId: string,
  signal: AbortSignal,
) => Promise<ConversationMessage[]>;
