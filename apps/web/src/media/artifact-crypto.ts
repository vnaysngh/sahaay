import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
// Originals and extraction are encrypted before entering PostgreSQL/backups.
// Keep this key independently of the database. Losing it loses artifact access.
async function key(create = false) {
  if (process.env.SAHAAY_ARTIFACT_KEY) {
    const value = Buffer.from(process.env.SAHAAY_ARTIFACT_KEY, "base64");
    if (value.length !== 32) throw Error("Artifact encryption unavailable");
    return value;
  }
  const configured = process.env.SAHAAY_ARTIFACT_KEY_FILE;
  if (
    process.env.NODE_ENV === "production" &&
    process.env.SAHAAY_LOCAL_PREVIEW !== "1" &&
    !configured
  )
    throw Error("Artifact encryption must be configured");
  const file = resolve(
    /* turbopackIgnore: true */ configured ??
      join(
        dirname(process.env.SAHAAY_MEDIA_DIR ?? ".local/media"),
        "artifact.key",
      ),
  );
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  // Explicit deployment key files must already exist; never replace a lost key.
  if (create && !configured)
    try {
      await writeFile(file, randomBytes(32), { flag: "wx", mode: 0o600 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  if ((await stat(file)).mode & 0o077)
    throw Error("Artifact key permissions must be private");
  const value = await readFile(file);
  if (value.length !== 32) throw Error("Artifact encryption unavailable");
  return value;
}
export async function seal(
  data: Buffer,
  owner: string,
  id: string,
  purpose: string,
) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", await key(true), iv);
  cipher.setAAD(Buffer.from(JSON.stringify([owner, id, purpose])));
  const body = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), body]);
}
export async function unseal(
  data: Buffer,
  owner: string,
  id: string,
  purpose: string,
) {
  if (data.length < 29 || data[0] !== 1)
    throw Error("Artifact encryption unavailable");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    await key(),
    data.subarray(1, 13),
  );
  cipher.setAAD(Buffer.from(JSON.stringify([owner, id, purpose])));
  cipher.setAuthTag(data.subarray(13, 29));
  return Buffer.concat([cipher.update(data.subarray(29)), cipher.final()]);
}
