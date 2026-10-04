import { z } from "zod";
import { structuredValue } from "./memory";
import type { MutationContext, MutationResult, RecordQuery } from "./memory";
export const itemInput = z
  .object({
    kind: z.string().trim().min(1).max(60),
    content: z.string().trim().min(1).max(2000),
    url: z.string().max(2048).url().nullable(),
    structuredValue: structuredValue.nullable(),
    listLabel: z.string().trim().max(60).nullable(),
    status: z.enum(["saved", "done", "archived"]),
  })
  .strict()
  .refine(
    (v) => !v.url || /^https?:\/\//i.test(v.url),
    "Only HTTP(S) item URLs are supported",
  );
export type ItemInput = z.infer<typeof itemInput>;
export type SavedItem = ItemInput & {
  id: string;
  version: number;
  sourceType: "user_explicit";
  sourceId: string;
  conversationId: string;
  createdAt: string;
  updatedAt: string;
  sourceAvailable: boolean;
};
export interface SavedItemService {
  find(userId: string, query: RecordQuery): Promise<SavedItem[]>;
  save(
    context: MutationContext,
    input: ItemInput,
  ): Promise<MutationResult<SavedItem>>;
  update(
    context: MutationContext,
    id: string,
    expectedVersion: number,
    input: ItemInput,
  ): Promise<MutationResult<SavedItem>>;
  remove(
    context: MutationContext,
    id: string,
    expectedVersion: number,
  ): Promise<MutationResult<SavedItem>>;
}

export function normalizeListLabel(
  label: string | null | undefined,
): string | null {
  return (
    label
      ?.trim()
      .toLowerCase()
      .replace(/\s+list$/, "")
      .trim() || null
  );
}
