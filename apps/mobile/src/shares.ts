import { requireNativeModule } from "expo-modules-core";
import { z } from "zod";
export const draftSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.number(),
  owner: z.string().nullish(),
  text: z.string().max(4000),
  instruction: z.string().max(4000),
  conversationId: z.string().uuid().nullish(),
  files: z
    .array(
      z.object({
        uri: z.string().startsWith("file://"),
        filename: z.string().regex(/^[\w.-]+$/),
        mime: z.enum(["image/png", "image/jpeg", "image/webp"]),
      }),
    )
    .max(3),
});
export type ShareDraft = z.infer<typeof draftSchema>;
const native = requireNativeModule("SahaayShare");
export const shares = {
  setOwner: (owner: string | null): Promise<void> => native.setOwner(owner),
  list: async (owner: string) =>
    z
      .array(draftSchema)
      .max(10)
      .parse(await native.list(owner)),
  claim: (id: string, owner: string): Promise<void> => native.claim(id, owner),
  markSubmitted: (
    id: string,
    owner: string,
    conversationId: string,
  ): Promise<void> => native.markSubmitted(id, owner, conversationId),
  remove: (id: string, owner: string): Promise<void> =>
    native.remove(id, owner),
  listen: (callback: (event: { error?: string }) => void) =>
    native.addListener("draftsChanged", callback),
};
