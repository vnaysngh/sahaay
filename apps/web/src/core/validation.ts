import { z } from "zod";
export const messageInput = z
  .object({
    conversationId: z.string().uuid(),
    requestId: z.string().uuid(),
    text: z.string().trim().min(1).max(4000),
  })
  .strict();
export class RequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
