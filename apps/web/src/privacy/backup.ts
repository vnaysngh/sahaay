import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { z } from "zod";
const header = Buffer.from("SAHAAYB1");
const payloadSchema = z
  .object({
    createdAt: z.string().datetime(),
    ledgerId: z.string().uuid(),
    dump: z.string(),
  })
  .strict();
function key(value: string) {
  if (!/^[a-f0-9]{64}$/i.test(value))
    throw Error("A 32-byte hexadecimal backup key is required");
  return Buffer.from(value, "hex");
}
export function encryptBackup(dump: Buffer, ledgerId: string, secret: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  const payload = Buffer.from(
    JSON.stringify({
      createdAt: new Date().toISOString(),
      ledgerId,
      dump: dump.toString("base64"),
    }),
  );
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  return Buffer.concat([header, iv, cipher.getAuthTag(), encrypted]);
}
export function decryptBackup(bytes: Buffer, secret: string, ledgerId: string) {
  if (!bytes.subarray(0, 8).equals(header) || bytes.length < 36)
    throw Error("Invalid encrypted backup");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(secret),
    bytes.subarray(8, 20),
  );
  decipher.setAuthTag(bytes.subarray(20, 36));
  const payload = payloadSchema.parse(
    JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(36)),
        decipher.final(),
      ]).toString("utf8"),
    ),
  );
  const age = Date.now() - Date.parse(payload.createdAt);
  if (age < -300000 || age > 30 * 86400000 || payload.ledgerId !== ledgerId)
    throw Error("Expired backup or mismatched deletion ledger");
  return Buffer.from(payload.dump, "base64");
}
