import * as SecureStore from "expo-secure-store";
import { z } from "zod";
const pending = z.object({
  owner: z.string(),
  conversationId: z.string().uuid(),
  requestId: z.string().uuid(),
});
const key = "sahaay_pending_run";
export async function readPendingRun(owner: string) {
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return null;
  try {
    const value = pending.parse(JSON.parse(raw));
    if (value.owner === owner) return value;
  } catch {}
  await SecureStore.deleteItemAsync(key);
  return null;
}
export async function keepPendingRun(
  owner: string,
  conversationId: string,
  requestId: string,
) {
  await SecureStore.setItemAsync(
    key,
    JSON.stringify(pending.parse({ owner, conversationId, requestId })),
  );
}
export async function clearPendingRun() {
  await SecureStore.deleteItemAsync(key);
}
