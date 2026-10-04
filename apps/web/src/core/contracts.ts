export type ResearchSource = {
  id: string;
  url: string;
  title: string;
  kind: "cited" | "consulted";
  retrievedAt: string;
  publishedAt: string | null;
};
export type ProviderEvent =
  | { type: "researching" }
  | { type: "record_changes"; operations: string[] }
  | { type: "sources"; sources: ResearchSource[] };
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
      stage: "thinking" | "understanding" | "transcribing" | "researching";
    }
  | { type: "sources"; sources: ResearchSource[] }
  | { type: "delta"; text: string }
  | { type: "complete"; messageId: string; text: string }
  | { type: "error"; code: string; message: string };
export interface AgentProvider {
  stream(
    context: ConversationMessage[],
    options: {
      signal: AbortSignal;
      responseLanguage?: string;
      request?: UnifiedRequest;
    },
  ): AsyncIterable<string | ProviderEvent>;
}
export interface ConversationStore {
  context(
    userId: string,
    conversationId: string,
    messageId: string,
  ): Promise<ConversationMessage[]>;
  complete(
    request: UnifiedRequest,
    text: string,
    sources?: ResearchSource[],
  ): Promise<string | null>;
  fail(request: UnifiedRequest, code: string): Promise<void>;
}

export type InputNormalizer = (
  context: ConversationMessage[],
  userId: string,
  signal: AbortSignal,
) => Promise<ConversationMessage[]>;
