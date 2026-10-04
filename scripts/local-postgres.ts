import "./env";
import { mkdir, access, appendFile, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve } from "node:path";
import EmbeddedPostgres from "embedded-postgres";
async function main() {
  if (process.env.NODE_ENV === "production")
    throw new Error("This launcher is for local development only");
  await mkdir(".local", { recursive: true, mode: 0o700 });
  if (!process.env.DATABASE_URL) {
    const password = randomBytes(24).toString("hex");
    await appendFile(
      ".env.local",
      `\nDATABASE_URL=postgresql://sahaay:${password}@127.0.0.1:55432/sahaay\n`,
      { mode: 0o600 },
    );
    process.env.DATABASE_URL = `postgresql://sahaay:${password}@127.0.0.1:55432/sahaay`;
  }
  if (!process.env.BETTER_AUTH_SECRET)
    await appendFile(
      ".env.local",
      `BETTER_AUTH_SECRET=${randomBytes(32).toString("hex")}\n`,
      { mode: 0o600 },
    );
  if (!process.env.BETTER_AUTH_URL)
    await appendFile(".env.local", "BETTER_AUTH_URL=http://localhost:3000\n", {
      mode: 0o600,
    });
  await chmod(".env.local", 0o600);
  const uri = new URL(process.env.DATABASE_URL);
  if (
    uri.hostname !== "127.0.0.1" ||
    uri.port !== "55432" ||
    uri.pathname !== "/sahaay"
  )
    throw new Error(
      "DATABASE_URL is already configured. Start that database instead of this local launcher.",
    );
  const pg = new EmbeddedPostgres({
    databaseDir: resolve(".local/postgres"),
    user: decodeURIComponent(uri.username),
    password: decodeURIComponent(uri.password),
    port: 55432,
    persistent: true,
    authMethod: "scram-sha-256",
    postgresFlags: [
      "-c",
      "listen_addresses=127.0.0.1",
      "-c",
      `unix_socket_directories=${resolve(".local")}`,
    ],
    onLog: () => {},
    onError: () => {},
  });
  try {
    await access(".local/postgres/PG_VERSION");
  } catch {
    await pg.initialise();
  }
  await pg.start();
  const client = pg.getPgClient("postgres", "127.0.0.1");
  await client.connect();
  for (const name of ["sahaay", "sahaay_test"]) {
    const result = await client.query(
      "SELECT 1 FROM pg_database WHERE datname=$1",
      [name],
    );
    if (!result.rowCount) await pg.createDatabase(name);
  }
  await client.end();
  console.log(
    "Local PostgreSQL 17 ready on 127.0.0.1:55432. Credentials saved privately in .env.local.",
  );
  let stopping = false;
  const stop = async () => {
    if (stopping) return;
    stopping = true;
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  await new Promise(() => {});
}
main().catch(() => {
  console.error(
    "Local database could not start. Check port 55432 and the development setup.",
  );
  process.exitCode = 1;
});
