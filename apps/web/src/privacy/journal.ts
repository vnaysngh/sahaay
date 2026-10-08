import { mkdir, open, readdir, readFile, unlink } from "node:fs/promises";
import { resolve, join } from "node:path";
import { z } from "zod";
export const evidenceSchema = z
  .object({
    id: z.string().uuid(),
    userId: z.string().min(1).max(128),
    kind: z.enum([
      "memory",
      "item",
      "conversation",
      "account",
      "pause",
      "followup",
      "artifact",
    ]),
    ids: z.array(z.string().uuid()).max(500),
    sourceIds: z.array(z.string().uuid()).max(500),
    paused: z.boolean().optional(),
    keepVersion: z.number().int().positive().optional(),
    createdAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .strict();
export type Evidence = z.infer<typeof evidenceSchema>;
// Kept on the same private persistent volume as media, outside database snapshots.
export class DeletionJournal {
  constructor(
    readonly root = resolve(
      /* turbopackIgnore: true */ process.env.SAHAAY_DELETION_LEDGER_DIR ??
        ".local/deletions",
    ),
  ) {}
  async identity(create = false) {
    if (create) {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      try {
        await writeIdentity(this.root);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      }
    }
    return z
      .string()
      .uuid()
      .parse((await readFile(join(this.root, ".ledger-id"), "utf8")).trim());
  }
  async append(
    input: Pick<Evidence, "userId" | "kind" | "ids" | "sourceIds"> & {
      paused?: boolean;
      keepVersion?: number;
    },
  ) {
    const now = Date.now();
    const entry = evidenceSchema.parse({
      ...input,
      id: crypto.randomUUID(),
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + 31 * 86400000).toISOString(),
    });
    await this.identity(true);
    const file = await open(join(this.root, `${entry.id}.json`), "wx", 0o600);
    try {
      await file.writeFile(JSON.stringify(entry));
      await file.sync();
    } finally {
      await file.close();
    }
    const directory = await open(this.root, "r");
    try {
      await directory.sync();
    } finally {
      await directory.close();
    }
    return entry;
  }
  async entries() {
    let names: string[];
    try {
      names = await readdir(this.root);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw e;
    }
    const rows: Evidence[] = [];
    for (const name of names) {
      if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
      const entry = evidenceSchema.parse(
        JSON.parse(await readFile(join(this.root, name), "utf8")),
      );
      if (Date.parse(entry.expiresAt) > Date.now()) rows.push(entry);
    }
    return rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  async cleanup() {
    let names: string[];
    try {
      names = await readdir(this.root);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
      throw e;
    }
    for (const name of names) {
      if (!/^[a-f0-9-]{36}\.json$/.test(name)) continue;
      const entry = evidenceSchema.parse(
        JSON.parse(await readFile(join(this.root, name), "utf8")),
      );
      if (Date.parse(entry.expiresAt) <= Date.now())
        await unlink(join(this.root, name));
    }
  }
}

async function writeIdentity(root: string) {
  const file = await open(join(root, ".ledger-id"), "wx", 0o600);
  try {
    await file.writeFile(crypto.randomUUID());
    await file.sync();
  } finally {
    await file.close();
  }
}
