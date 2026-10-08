import { it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { seal, unseal } from "../../apps/web/src/media/artifact-crypto";
import { maskIdentifiers } from "../../apps/web/src/core/artifacts";
it("authenticated encryption rejects tampering, wrong owner, ID and purpose", async () => {
  const old = process.env.SAHAAY_ARTIFACT_KEY;
  process.env.SAHAAY_ARTIFACT_KEY = randomBytes(32).toString("base64");
  try {
    const data = Buffer.from("synthetic sensitive original"),
      encrypted = await seal(data, "alice", "document", "original");
    expect(encrypted.toString()).not.toContain("synthetic sensitive");
    expect(await unseal(encrypted, "alice", "document", "original")).toEqual(
      data,
    );
    await expect(
      unseal(encrypted, "bob", "document", "original"),
    ).rejects.toThrow();
    await expect(
      unseal(encrypted, "alice", "another", "original"),
    ).rejects.toThrow();
    await expect(
      unseal(encrypted, "alice", "document", "understanding"),
    ).rejects.toThrow();
    encrypted[encrypted.length - 1] ^= 1;
    await expect(
      unseal(encrypted, "alice", "document", "original"),
    ).rejects.toThrow();
  } finally {
    if (old === undefined) delete process.env.SAHAAY_ARTIFACT_KEY;
    else process.env.SAHAAY_ARTIFACT_KEY = old;
  }
});
it("generic understood text masks full identity numbers but preserves last four", () => {
  expect(maskIdentifiers("0000 1111 2222")).toBe("•••• •••• 2222");
  expect(maskIdentifiers("AAAAA0000A")).toBe("[identity number masked]");
});
it("an explicitly configured missing key file is never silently regenerated", async () => {
  const { mkdtemp, rm, access } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const root = await mkdtemp(join(tmpdir(), "sahaay-artifact-key-"));
  const oldKey = process.env.SAHAAY_ARTIFACT_KEY,
    oldFile = process.env.SAHAAY_ARTIFACT_KEY_FILE;
  delete process.env.SAHAAY_ARTIFACT_KEY;
  const file = join(root, "missing.key");
  process.env.SAHAAY_ARTIFACT_KEY_FILE = file;
  try {
    await expect(
      seal(Buffer.from("synthetic"), "alice", "id", "original"),
    ).rejects.toThrow();
    await expect(access(file)).rejects.toThrow();
  } finally {
    if (oldKey === undefined) delete process.env.SAHAAY_ARTIFACT_KEY;
    else process.env.SAHAAY_ARTIFACT_KEY = oldKey;
    if (oldFile === undefined) delete process.env.SAHAAY_ARTIFACT_KEY_FILE;
    else process.env.SAHAAY_ARTIFACT_KEY_FILE = oldFile;
    await rm(root, { recursive: true, force: true });
  }
});
