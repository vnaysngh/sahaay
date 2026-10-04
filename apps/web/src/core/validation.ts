import { z } from "zod";
export const messageInput = z
  .object({
    conversationId: z.string().uuid(),
    requestId: z.string().uuid(),
    text: z.string().trim().max(4000),
    attachmentIds: z.array(z.string().uuid()).max(4).default([]),
  })
  .strict()
  .refine(
    (input) => Boolean(input.text || input.attachmentIds.length),
    "Send text or an attachment",
  )
  .refine(
    (input) => new Set(input.attachmentIds).size === input.attachmentIds.length,
    "Duplicate attachments",
  );
export class RequestError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
