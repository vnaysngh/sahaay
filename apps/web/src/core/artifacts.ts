import { z } from "zod";
import type { MutationContext, MutationResult } from "./memory";
export const artifactCategories = [
  "identity_document",
  "travel_document",
  "receipt",
  "invoice",
  "booking",
  "medical_document",
  "product",
  "screenshot",
  "photo",
  "other",
] as const;
export const artifactInput = z
  .object({
    attachmentId: z.string().uuid(),
    title: z.string().trim().min(1).max(100),
    category: z.enum(artifactCategories),
    description: z.string().max(1000),
    extractedText: z.string().max(6000),
    metadata: z
      .array(
        z
          .object({ key: z.string().max(50), value: z.string().max(1000) })
          .strict(),
      )
      .max(20),
    relatedItemId: z.string().uuid().nullable(),
  })
  .strict();
export type ArtifactInput = z.infer<typeof artifactInput>;
export type ArtifactSummary = {
  id: string;
  title: string;
  category: string;
  mime: string;
  bytes: number;
  relatedItemId: string | null;
  createdAt: string;
  version: number;
};
export type Artifact = ArtifactSummary & {
  description: string;
  extractedText: string;
  metadata: Array<{ key: string; value: string }>;
};
export interface ArtifactService {
  create(
    ctx: MutationContext,
    input: ArtifactInput,
  ): Promise<MutationResult<ArtifactSummary>>;
  search(
    owner: string,
    query: string | null,
    category?: string | null,
  ): Promise<ArtifactSummary[]>;
  get(owner: string, id: string): Promise<Artifact>;
  getOriginal(
    owner: string,
    id: string,
  ): Promise<{ artifact: ArtifactSummary; data: Buffer }>;
  requestOriginal(ctx: MutationContext, id: string): Promise<ArtifactSummary>;
  delete(
    ctx: MutationContext,
    id: string,
    version: number,
  ): Promise<MutationResult<ArtifactSummary>>;
}
// Full identity numbers are unnecessary in the understood representation. The
// received original remains intact. Addresses/names remain encrypted, not indexed.
export function maskIdentifiers(text: string) {
  return text
    .replace(
      /\b\d{4}[ -]?\d{4}[ -]?\d{4}\b/g,
      (match) => "•••• •••• " + match.replace(/\D/g, "").slice(-4),
    )
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, "[identity number masked]");
}
export function cleanUnderstanding(input: ArtifactInput) {
  return {
    description: maskIdentifiers(input.description),
    extractedText: maskIdentifiers(input.extractedText),
    metadata: input.metadata
      .filter(
        (m) =>
          !/(?:aadhaar|passport|pan|identity|licen[cs]e).*number|full.*number/i.test(
            m.key,
          ),
      )
      .map((m) => ({ ...m, value: maskIdentifiers(m.value) })),
  };
}
