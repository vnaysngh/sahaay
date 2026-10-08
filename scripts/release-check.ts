import "./env";
import { Pool } from "pg";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { getConfig } from "../apps/web/src/config";
import { emailConfigured } from "../apps/web/src/auth/email";
const local = process.argv.includes("--local");
let failed = false;
function check(name: string, valid: boolean) {
  console.log(`${valid ? "PASS" : "BLOCKED"}: ${name}`);
  failed ||= !valid;
}
async function main() {
  const c = getConfig();
  const pool = new Pool({
    connectionString: c.DATABASE_URL,
    connectionTimeoutMillis: 5000,
  });
  try {
    check(
      "PostgreSQL M5 migration",
      Boolean(
        (
          await pool.query(
            "SELECT column_name FROM information_schema.columns WHERE table_name='user' AND column_name='processing_paused'",
          )
        ).rowCount,
      ),
    );
    check(
      "Required OpenAI and Sarvam configuration",
      Boolean(c.OPENAI_API_KEY && process.env.SARVAM_API_KEY),
    );
    for (const [name, path] of [
      ["Private media volume", process.env.SAHAAY_MEDIA_DIR ?? ".local/media"],
      [
        "Deletion ledger volume",
        process.env.SAHAAY_DELETION_LEDGER_DIR ?? ".local/deletions",
      ],
    ]) {
      try {
        await access(resolve(path), constants.W_OK);
        check(name!, true);
      } catch {
        check(name!, false);
      }
    }
    if (!local) {
      const origin = new URL(c.BETTER_AUTH_URL),
        database = new URL(c.DATABASE_URL);
      check(
        "Public HTTPS authentication origin",
        origin.protocol === "https:" &&
          !["localhost", "127.0.0.1"].includes(origin.hostname),
      );
      check(
        "Verified transactional email configuration",
        emailConfigured() &&
          ["465", "587"].includes(process.env.SMTP_PORT ?? "") &&
          process.env.SAHAAY_EMAIL_DELIVERY_VERIFIED === "1",
      );
      check(
        "No local preview or synthetic test bypass",
        ![
          "SAHAAY_LOCAL_PREVIEW",
          "SAHAAY_E2E",
          "SAHAAY_AUTH_EMAIL_CAPTURE",
        ].some((k) => process.env[k] === "1"),
      );
      check(
        "Database TLS verification",
        database.searchParams.get("sslmode") === "verify-full",
      );
      check(
        "Artifact encryption key explicitly configured",
        Boolean(
          process.env.SAHAAY_ARTIFACT_KEY ||
          process.env.SAHAAY_ARTIFACT_KEY_FILE,
        ),
      );
      check(
        "Encrypted backup key configured",
        /^[a-f0-9]{64}$/i.test(process.env.SAHAAY_BACKUP_KEY ?? ""),
      );
      check(
        "Persistent volume, daily backup and recovery drill confirmed",
        process.env.SAHAAY_OPERATIONS_VERIFIED === "1",
      );
      check(
        "Processor disclosure/retention reviewed for tester deployment",
        process.env.SAHAAY_PROCESSORS_REVIEWED === "1",
      );
    }
  } finally {
    await pool.end();
  }
  console.log(
    local
      ? "Local readiness only; this does not authorize tester launch."
      : "Tester readiness check complete; no deployment or invitations performed.",
  );
  if (failed) process.exitCode = 1;
}
main().catch(() => {
  console.error(
    "Readiness check failed. Check server configuration and PostgreSQL availability.",
  );
  process.exitCode = 1;
});
