import "../../scripts/env";
import { randomBytes } from "node:crypto";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Pool } from "pg";
import { it, expect } from "vitest";
import { dumpDatabase, restoreDatabase } from "../../scripts/postgres-tools";
import {
  encryptBackup,
  decryptBackup,
} from "../../apps/web/src/privacy/backup";
import { DeletionJournal } from "../../apps/web/src/privacy/journal";
import { suppressDeletedData } from "../../apps/web/src/privacy/restore";
it("real encrypted PostgreSQL dump/restore suppresses later deletion and revokes restored credentials", async () => {
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const source = `backup_${suffix}`,
    target = `restore_${suffix}`;
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const root = await mkdtemp(join(tmpdir(), "sahaay-backup-test-"));
  const url = new URL(process.env.DATABASE_URL!);
  let original: Pool | undefined, restored: Pool | undefined;
  try {
    await admin.query(`CREATE DATABASE "${source}"`);
    await admin.query(`CREATE DATABASE "${target}"`);
    url.pathname = `/${source}`;
    const sourceUrl = url.toString();
    original = new Pool({ connectionString: sourceUrl });
    for (const file of (await readdir("apps/web/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await original.query(
        await readFile(`apps/web/migrations/${file}`, "utf8"),
      );
    await original.query(
      `INSERT INTO "user"(id,name,email) VALUES('deleted','Deleted','deleted@example.invalid'),('kept','Kept','kept@example.invalid')`,
    );
    await original.query(
      `INSERT INTO session(id,token,user_id,expires_at) VALUES('old-session','old-token','kept',now()+interval '1 day')`,
    );
    await original.query(
      `INSERT INTO account(id,account_id,provider_id,user_id,password) VALUES('credential','kept','credential','kept','old-hash')`,
    );
    const journal = new DeletionJournal(join(root, "ledger"));
    const identity = await journal.identity(true),
      secret = randomBytes(32).toString("hex");
    const backup = encryptBackup(
      await dumpDatabase(sourceUrl),
      identity,
      secret,
    );
    await journal.append({
      userId: "deleted",
      kind: "account",
      ids: [],
      sourceIds: [],
    });
    url.pathname = `/${target}`;
    await restoreDatabase(
      url.toString(),
      decryptBackup(backup, secret, identity),
    );
    restored = new Pool({ connectionString: url.toString() });
    expect((await restored.query('SELECT id FROM "user"')).rowCount).toBe(2);
    await suppressDeletedData(restored, await journal.entries());
    expect((await restored.query('SELECT id FROM "user"')).rows).toEqual([
      { id: "kept" },
    ]);
    expect((await restored.query("SELECT id FROM session")).rowCount).toBe(0);
    expect(
      (await restored.query("SELECT password FROM account")).rows[0].password,
    ).toBeNull();
  } finally {
    await original?.end();
    await restored?.end();
    await admin.query(`DROP DATABASE IF EXISTS "${source}"`);
    await admin.query(`DROP DATABASE IF EXISTS "${target}"`);
    await admin.end();
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
