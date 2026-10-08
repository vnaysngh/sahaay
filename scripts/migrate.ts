import "./env";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { migrationFailure } from "./migration-errors";
let stage = "configuration";
async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 15000,
  });
  stage = "database connection";
  let client;
  try {
    client = await pool.connect();
  } catch (error) {
    await pool.end();
    throw error;
  }
  try {
    stage = "migration lock";
    await client.query("SELECT pg_advisory_lock(173931)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS sahaay_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    for (const file of (await readdir("apps/web/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()) {
      stage = `migration ${file}`;
      const sql = await readFile(`apps/web/migrations/${file}`, "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const existing = await client.query(
        "SELECT checksum FROM sahaay_migrations WHERE name=$1",
        [file],
      );
      if (existing.rowCount) {
        if (existing.rows[0].checksum !== checksum)
          throw new Error("Applied migration changed");
        continue;
      }
      if (process.argv.includes("--check"))
        throw new Error("Pending migration");
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO sahaay_migrations(name,checksum) VALUES ($1,$2)",
          [file, checksum],
        );
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
      console.log(`Applied ${file}`);
    }
    console.log("Database migrations are current.");
  } finally {
    await client.query("SELECT pg_advisory_unlock(173931)");
    client.release();
    await pool.end();
  }
}
main().catch((error: unknown) => {
  console.error(`Migration failed during ${stage}: ${migrationFailure(error)}`);
  process.exitCode = 1;
});
