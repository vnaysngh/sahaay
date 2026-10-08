import { z } from "zod";
import type { UnifiedRequest } from "./contracts";
import { RequestError } from "./validation";
export const structuredValue = z
  .record(
    z.string().max(50),
    z.union([z.string().max(300), z.number().finite(), z.boolean(), z.null()]),
  )
  .refine((v) => Object.keys(v).length <= 12);
export const memoryInput = z
  .object({
    memoryKey: z.string().trim().min(1).max(100),
    type: z.enum(["semantic", "episodic"]),
    category: z.string().trim().max(60).nullable(),
    content: z.string().trim().min(1).max(1000),
    structuredValue: structuredValue.nullable(),
    scope: z.string().trim().min(1).max(60),
  })
  .strict();
export type MemoryInput = z.infer<typeof memoryInput>;
export type Memory = MemoryInput & {
  id: string;
  version: number;
  sourceType: "user_explicit";
  sourceId: string;
  conversationId: string;
  confidence: number;
  validFrom: string;
  validUntil: string | null;
  supersedesId: string | null;
  createdAt: string;
  updatedAt: string;
  sourceAvailable: boolean;
};
export type ItemIntentReview = (
  proposal: unknown,
  directText: string,
) => Promise<boolean>;
export type MutationContext = {
  request: UnifiedRequest;
  actionId: string;
  // Server callback; never part of the model's tool arguments.
  reviewItemIntent?: ItemIntentReview;
};
export type MutationResult<T> = {
  outcome: "committed" | "replayed" | "deleted";
  record: T | null;
  targetId: string;
};
export type RecordQuery = {
  query: string | null;
  scope?: string;
  category?: string;
  type?: "semantic" | "episodic";
  listLabel?: string;
  recordRole?: "item" | "object";
  parentId?: string;
  stateLabel?: string;
  status?: "saved" | "done" | "archived";
};
export interface MemoryService {
  recall(userId: string, query: RecordQuery): Promise<Memory[]>;
  remember(
    context: MutationContext,
    input: MemoryInput,
  ): Promise<MutationResult<Memory>>;
  update(
    context: MutationContext,
    id: string,
    expectedVersion: number,
    input: MemoryInput,
  ): Promise<MutationResult<Memory>>;
  forget(
    context: MutationContext,
    id: string,
    expectedVersion: number,
  ): Promise<MutationResult<Memory>>;
}
export type PersistencePermissions = {
  memoryWrite: boolean;
  memoryDelete: boolean;
  itemWrite: boolean;
  itemDelete: boolean;
};
// Authorization comes from the current user's own text/transcript, never model arguments or pixels/pages.
export function persistencePermissions(text: string): PersistencePermissions {
  const direct = text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^[ \t]*>.*$/gm, "")
    .replace(/["“][^"”]*["”]/g, "");
  const denied =
    /\b(don['’]?t|do not|never)\s+(remember|save|store|forget|delete)|मत\s*(याद|सेव|भूल|हटा)/i.test(
      direct,
    ) ||
    /^(?:please\s+)?(?:explain|translate|summarize|quote|what does)\b/i.test(
      direct.trim(),
    );
  return {
    memoryWrite:
      !denied &&
      /\b(remember (?:this|that|my|i\b)|keep in mind|my preference is|update (?:my |the )?memory|correct (?:my |the )?memory|actually (?:i prefer|my preference is))\b|याद (?:रख|रखना)|yaad (?:rakh|rakhna)|(?:असल में|दरअसल).{0,80}पसंद/i.test(
        direct,
      ) &&
      !/\b(explain|translate|quote|example|what does)\b/i.test(direct),
    memoryDelete:
      !denied &&
      /\b(forget (?:my|that|this|the|what|everything)|delete (?:my |the |this )?memor(?:y|ies))\b|भूल जाओ|याददाश्त.*हटा|bhool jao/i.test(
        direct,
      ),
    itemWrite:
      !denied &&
      /\b(save (?:this|that|the|my|an?|https?:)|add .{0,80} to (?:my|the)|update (?:my |the |this )?(?:saved|item|list)|mark .{0,80}(?:done|archived)|move .{0,80} to)\b|सेव (?:कर|करना)|save karo|(?:आइडिया|आइटम|लिस्ट|सूची).{0,80}(?:पूरा कर|आर्काइव कर|बदल दो)|mark .{0,60} done/i.test(
        direct,
      ) &&
      !/\b(explain|translate|quote|example|what does)\b/i.test(direct),
    itemDelete:
      !denied &&
      /\b(?:remove|delete) .{0,100}(?:saved|item|list|idea|hotel)|\b(?:remove|delete) (?:this|that)\b|सेव.*हटा|(?:आइडिया|आइटम|लिस्ट|सूची).{0,80}(?:हटा|डिलीट)/i.test(
        direct,
      ),
  };
}
export function searchTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) ?? [])]
    .filter((t) => t.length > 1)
    .slice(0, 8);
}

export function isMemoryCorrection(text: string) {
  return /\b(actually|instead|update (?:my |the )?memory|correct (?:my |the )?memory)\b|असल में|दरअसल/i.test(
    text,
  );
}

// No credential vault or sensitive-identifier persistence policy exists in the MVP.
// A conservative deny rule is intentional; it is not automatic PII classification.
export function requireSafePersistence(value: unknown) {
  const text = JSON.stringify(value);
  if (
    /password|passphrase|\botp\b|one[ -]time (?:password|code)|api[ _-]?key|access[ _-]?token|secret[ _-]?key|aadha?ar|passport[ _-]?(?:number|no)|\bpan[ _-]?(?:number|card)\b|पासवर्ड|ओटीपी|आधार/iu.test(
      text,
    ) ||
    /sk-(?:proj-)?[a-zA-Z0-9_-]{20,}/.test(text)
  )
    throw new RequestError(
      400,
      "sensitive_record",
      "Sahaay cannot save passwords, access tokens, OTPs or sensitive identity numbers. Remove those details before saving.",
    );
}
