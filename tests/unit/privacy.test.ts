import { it, expect } from "vitest";
import {
  encryptBackup,
  decryptBackup,
} from "../../apps/web/src/privacy/backup";
import { discovery } from "../../apps/web/src/core/discovery";
import { randomBytes } from "node:crypto";
it("encrypts/authenticates backups and binds them to their deletion ledger", () => {
  const secret = randomBytes(32).toString("hex"),
    ledger = crypto.randomUUID(),
    content = Buffer.from("private fixture never plaintext in backups");
  const bytes = encryptBackup(content, ledger, secret);
  expect(bytes.toString()).not.toContain("private fixture");
  expect(decryptBackup(bytes, secret, ledger)).toEqual(content);
  const changed = Buffer.from(bytes);
  changed[changed.length - 1] ^= 1;
  expect(() => decryptBackup(changed, secret, ledger)).toThrow();
  expect(() => decryptBackup(bytes, secret, crypto.randomUUID())).toThrow();
  expect(() =>
    decryptBackup(bytes, randomBytes(32).toString("hex"), ledger),
  ).toThrow();
});
it("produces only coarse discovery enums, not user content or identifiers", () => {
  const event = discovery({
    userId: "private-owner",
    conversationId: "private-convo",
    messageId: "private-message",
    requestId: "private-request",
    receivedAt: new Date().toISOString(),
    inputs: [
      {
        type: "text",
        text: "मुझे compare करो https://private.example/person?secret=hidden and pay money now",
      },
      { type: "image", attachmentId: "private-photo" },
    ],
  });
  expect(event.language).toBe("mixed");
  expect(event.modalities).toContain("image");
  expect(event.intents).toContain("compare");
  expect(JSON.stringify(event)).not.toMatch(/private|secret|hidden|मुझे/);
  const voice = discovery(
    {
      userId: "owner",
      conversationId: "convo",
      messageId: "message",
      requestId: "request",
      receivedAt: new Date().toISOString(),
      inputs: [{ type: "audio", attachmentId: "voice" }],
    },
    "मेरी पसंद याद रखना",
  );
  expect(voice.language).toBe("hi");
  expect(voice.modalities).toEqual(["voice"]);
  expect(voice.intents).toContain("remember");
});

it("blocks credential/identity persistence while allowing ordinary explicit amounts and ideas", async () => {
  const { requireSafePersistence } =
    await import("../../apps/web/src/core/memory");
  for (const content of [
    "my password is fixture-only",
    "API_KEY: fixture-token",
    "आधार नंबर 1234",
    "OTP 123456",
  ])
    expect(() => requireSafePersistence({ content })).toThrow(/cannot save/);
  expect(() =>
    requireSafePersistence({ content: "Project price is 25000 INR" }),
  ).not.toThrow();
  expect(() =>
    requireSafePersistence({ content: "Video idea: quiet morning walk" }),
  ).not.toThrow();
});
