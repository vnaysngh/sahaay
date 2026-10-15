import { beforeEach, afterEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  store: new Map<string, string>(),
  complete: vi.fn(),
}));
vi.mock("expo-secure-store", () => ({
  getItemAsync: async (key: string) => mocks.store.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => {
    mocks.store.set(key, value);
  },
  deleteItemAsync: async (key: string) => {
    mocks.store.delete(key);
  },
}));
vi.mock("../../apps/mobile/src/auth", () => ({
  baseURL: "https://sahaay.example.invalid",
  api: { completeGoogle: mocks.complete },
}));
import {
  beginGoogleAuthorization,
  captureGoogleCompletion,
  completeGoogleAuthorization,
} from "../../apps/mobile/src/google-authorization";
const transaction = "a".repeat(64),
  reference = "b".repeat(43);
const url = `https://sahaay.example.invalid/connect/google/complete?transactionId=${transaction}&reference=${reference}`;
beforeEach(() => {
  mocks.store.clear();
  mocks.complete.mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => {
  vi.restoreAllMocks();
});
it("rejects unexpected hosts/paths and mismatched transaction IDs", async () => {
  await beginGoogleAuthorization("alice", transaction);
  await captureGoogleCompletion(
    url.replace("sahaay.example.invalid", "attacker.example"),
  );
  await captureGoogleCompletion(
    url.replace("/connect/google/complete", "/sign-in"),
  );
  await captureGoogleCompletion(url.replace(transaction, "c".repeat(64)));
  expect(await completeGoogleAuthorization("alice")).toBe(false);
  expect(mocks.complete).not.toHaveBeenCalled();
});
it("binds completion to the initiating signed-in account and does not replay it", async () => {
  await beginGoogleAuthorization("alice", transaction);
  await captureGoogleCompletion(url);
  expect(await completeGoogleAuthorization("bob")).toBe(false);
  expect(await completeGoogleAuthorization("alice")).toBe(true);
  expect(mocks.complete).toHaveBeenCalledExactlyOnceWith(
    transaction,
    reference,
  );
  expect(await completeGoogleAuthorization("alice")).toBe(false);
});
it("retains signed-out completion for the same account across a cold-start module reload", async () => {
  await beginGoogleAuthorization("alice", transaction);
  await captureGoogleCompletion(url);
  vi.resetModules();
  const restarted = await import("../../apps/mobile/src/google-authorization");
  expect(await restarted.completeGoogleAuthorization("bob")).toBe(false);
  expect(await restarted.completeGoogleAuthorization("alice")).toBe(true);
});
it("does not treat browser cancellation or expired/corrupt local state as a successful connection", async () => {
  await beginGoogleAuthorization("alice", transaction);
  await captureGoogleCompletion(
    "https://sahaay.example.invalid/connect/google/complete?google=cancelled",
  );
  expect(await completeGoogleAuthorization("alice")).toBe(false);
  const future = Date.now() + 21 * 60000;
  vi.spyOn(Date, "now").mockReturnValue(future);
  await captureGoogleCompletion(url);
  expect(await completeGoogleAuthorization("alice")).toBe(false);
  mocks.store.set("sahaay.google.authorization", "not JSON");
  expect(await completeGoogleAuthorization("alice")).toBe(false);
  expect(mocks.complete).not.toHaveBeenCalled();
});
it("does not automatically retry an uncertain server completion", async () => {
  await beginGoogleAuthorization("alice", transaction);
  await captureGoogleCompletion(url);
  mocks.complete.mockRejectedValueOnce(new Error("Network interrupted"));
  await expect(completeGoogleAuthorization("alice")).rejects.toThrow(
    "Network interrupted",
  );
  expect(await completeGoogleAuthorization("alice")).toBe(false);
  expect(mocks.complete).toHaveBeenCalledTimes(1);
});
