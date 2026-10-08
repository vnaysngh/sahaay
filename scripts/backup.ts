import "./env";
import {
  writeFile,
  mkdir,
  readFile,
  readdir,
  stat,
  unlink,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { Pool } from "pg";
import { dumpDatabase, restoreDatabase } from "./postgres-tools";
import { DeletionJournal } from "../apps/web/src/privacy/journal";
import { encryptBackup, decryptBackup } from "../apps/web/src/privacy/backup";
import { suppressDeletedData } from "../apps/web/src/privacy/restore";
async function main() {
  const journal = new DeletionJournal(),
    secret = process.env.SAHAAY_BACKUP_KEY ?? "";
  const restore = process.argv.includes("--restore");
  if (restore) {
    if (process.env.SAHAAY_RESTORE_OFFLINE !== "1")
      throw Error(
        "Stop the app and set SAHAAY_RESTORE_OFFLINE=1 before restoring",
      );
    const path = process.argv[process.argv.indexOf("--restore") + 1],
      target = process.env.SAHAAY_RESTORE_DATABASE_URL;
    if (!path || !target)
      throw Error("Backup path and a new empty restore database are required");
    const ledgerId = await journal.identity(),
      dump = decryptBackup(await readFile(path), secret, ledgerId);
    const pool = new Pool({ connectionString: target });
    try {
      if (
        (
          await pool.query(
            "SELECT count(*)::int n FROM information_schema.tables WHERE table_schema='public'",
          )
        ).rows[0].n !== 0
      )
        throw Error("Restore target must be empty");
      await restoreDatabase(target, dump);
      await suppressDeletedData(pool, await journal.entries());
      console.log(
        "Restore verified with deletion suppression. Sessions revoked, password reset required, and raw media marked unavailable. Review the target before switching the app database.",
      );
    } finally {
      await pool.end();
    }
  } else {
    if (!process.env.DATABASE_URL) throw Error("Database required");
    const ledgerId = await journal.identity(true);
    {
      const stdout = await dumpDatabase(process.env.DATABASE_URL);
      const root = resolve(process.env.SAHAAY_BACKUP_DIR ?? ".local/backups");
      await mkdir(root, { recursive: true, mode: 0o700 });
      const filename = join(root, `${Date.now()}.sahaay.enc`);
      await writeFile(filename, encryptBackup(stdout, ledgerId, secret), {
        mode: 0o600,
        flag: "wx",
      });
      for (const name of await readdir(root)) {
        if (!/^\d+\.sahaay\.enc$/.test(name)) continue;
        const file = join(root, name);
        if (Date.now() - (await stat(file)).mtimeMs > 30 * 86400000)
          await unlink(file);
      }
      console.log(
        "Encrypted database backup created. Raw media excluded; deletion ledger stays outside the snapshot.",
      );
    }
  }
}
main().catch((error: Error) => {
  console.error(
    error.message.startsWith("Stop the app")
      ? error.message
      : "Backup/restore failed. Check configuration, database tools, backup integrity, ledger and empty restore target.",
  );
  process.exitCode = 1;
});
