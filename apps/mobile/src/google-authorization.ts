import * as SecureStore from "expo-secure-store";
import { z } from "zod";
import { api, baseURL } from "./auth";
const key = "sahaay.google.authorization";
const pendingSchema = z.object({
  owner: z.string(),
  transactionId: z.string().regex(/^[a-f0-9]{64}$/),
  expiresAt: z.number(),
  reference: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .optional(),
});
let queue: Promise<unknown> = Promise.resolve();
function serialize<T>(work: () => Promise<T>) {
  const next = queue.then(work, work);
  queue = next.catch(() => {});
  return next;
}
async function pending() {
  const raw = await SecureStore.getItemAsync(key);
  if (!raw) return null;
  let parsed;
  try {
    parsed = pendingSchema.safeParse(JSON.parse(raw));
  } catch {
    await SecureStore.deleteItemAsync(key);
    return null;
  }
  if (!parsed.success || parsed.data.expiresAt < Date.now()) {
    await SecureStore.deleteItemAsync(key);
    return null;
  }
  return parsed.data;
}
export function beginGoogleAuthorization(owner: string, transactionId: string) {
  return serialize(() =>
    SecureStore.setItemAsync(
      key,
      JSON.stringify(
        pendingSchema.parse({
          owner,
          transactionId,
          expiresAt: Date.now() + 20 * 60000,
        }),
      ),
    ),
  );
}
export function captureGoogleCompletion(value: string) {
  return serialize(async () => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      return;
    }
    const base = new URL(baseURL);
    if (
      base.protocol !== "https:" ||
      url.origin !== base.origin ||
      url.pathname !== "/connect/google/complete"
    )
      return;
    const input = pendingSchema.shape.reference.safeParse(
      url.searchParams.get("reference"),
    );
    const current = await pending();
    if (
      !current ||
      !input.success ||
      !input.data ||
      current.transactionId !== url.searchParams.get("transactionId")
    )
      return;
    await SecureStore.setItemAsync(
      key,
      JSON.stringify({ ...current, reference: input.data }),
    );
  });
}
export function completeGoogleAuthorization(owner: string) {
  return serialize(async () => {
    const current = await pending();
    if (!current?.reference || current.owner !== owner) return false;
    // No automatic retry of a consumed completion; server status is authoritative.
    try {
      await api.completeGoogle(current.transactionId, current.reference);
      return true;
    } finally {
      await SecureStore.deleteItemAsync(key);
    }
  });
}
