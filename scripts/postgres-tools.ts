import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, access, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
const run = promisify(execFile);
export async function binary(name: "pg_dump" | "pg_restore") {
  const override =
    process.env[name === "pg_dump" ? "PG_DUMP_BIN" : "PG_RESTORE_BIN"];
  if (override) return override;
  const bundled = resolve(
    `node_modules/@embedded-postgres/${process.platform}-${process.arch}/native/bin/${name}`,
  );
  try {
    await access(bundled);
    return bundled;
  } catch {
    // macOS client-only Homebrew installation; deployments may use PATH or explicit overrides.
    for (const root of [
      "/opt/homebrew/opt/libpq/bin",
      "/usr/local/opt/libpq/bin",
    ]) {
      const path = join(root, name);
      try {
        await access(path);
        return path;
      } catch {
        /* Try the next installed location. */
      }
    }
    return name;
  }
}
export async function connection(uri: string) {
  const url = new URL(uri);
  const root = await mkdtemp(join(tmpdir(), "sahaay-pg-"));
  const pass = join(root, "password");
  const escape = (s: string) =>
    s.replaceAll("\\", "\\\\").replaceAll(":", "\\:");
  await writeFile(
    pass,
    [
      url.hostname,
      url.port || "5432",
      decodeURIComponent(url.pathname.slice(1)),
      decodeURIComponent(url.username),
      decodeURIComponent(url.password),
    ]
      .map(escape)
      .join(":") + "\n",
    { mode: 0o600 },
  );
  return {
    root,
    env: {
      PATH: process.env.PATH,
      PGHOST: url.hostname,
      PGPORT: url.port || "5432",
      PGDATABASE: decodeURIComponent(url.pathname.slice(1)),
      PGUSER: decodeURIComponent(url.username),
      PGPASSFILE: pass,
      PGSSLMODE:
        url.searchParams.get("sslmode") ??
        (["localhost", "127.0.0.1"].includes(url.hostname)
          ? "disable"
          : "verify-full"),
      ...(process.env.PGSSLROOTCERT
        ? { PGSSLROOTCERT: process.env.PGSSLROOTCERT }
        : {}),
    },
  };
}
export async function dumpDatabase(uri: string) {
  const c = await connection(uri);
  try {
    const { stdout } = await run(
      await binary("pg_dump"),
      ["--format=custom", "--no-owner", "--no-privileges"],
      { env: c.env, encoding: "buffer", maxBuffer: 64 * 1024 * 1024 },
    );
    return stdout;
  } finally {
    await rm(c.root, { recursive: true, force: true });
  }
}
export async function restoreDatabase(uri: string, dump: Buffer) {
  const c = await connection(uri);
  try {
    const archive = join(c.root, "archive");
    await writeFile(archive, dump, { mode: 0o600 });
    await run(
      await binary("pg_restore"),
      [
        "--dbname",
        c.env.PGDATABASE,
        "--no-owner",
        "--no-privileges",
        "--single-transaction",
        archive,
      ],
      { env: c.env, maxBuffer: 1024 * 1024 },
    );
  } finally {
    await rm(c.root, { recursive: true, force: true });
  }
}
