import "./env";
import { Pool } from "pg";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { Attachments } from "../apps/web/src/media/attachments";
import { PostgresConversations } from "../apps/web/src/db/conversations";
import { PostgresArtifacts } from "../apps/web/src/db/artifacts";
import { startSahaay, sahaayEvents } from "../apps/web/src/core/runtime";
// Invented labelled document only; no real government ID data or Telegram sends.
async function main() {
  if (process.env.SAHAAY_E2E === "1") throw Error("Live provider required");
  const schema = `artifact_eval_${crypto.randomUUID().replaceAll("-", "")}`,
    admin = new Pool({ connectionString: process.env.DATABASE_URL }),
    root = await mkdtemp(join(tmpdir(), "sahaay-artifact-eval-")),
    globals = globalThis as typeof globalThis & { sahaayPool?: Pool },
    prior = globals.sahaayPool,
    keys = ["SAHAAY_MEDIA_DIR", "SAHAAY_DELETION_LEDGER_DIR"] as const,
    previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  let pool: Pool | undefined,
    phase = "setup";
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema},public`,
    });
    globals.sahaayPool = pool;
    process.env.SAHAAY_MEDIA_DIR = join(root, "media");
    process.env.SAHAAY_DELETION_LEDGER_DIR = join(root, "journal");
    for (const f of (await readdir("apps/web/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await pool.query(await readFile(`apps/web/migrations/${f}`, "utf8"));
    await pool.query(
      `INSERT INTO "user"(id,name,email,email_verified) VALUES('eval','Synthetic','artifact-eval@example.invalid',true)`,
    );
    const media = new Attachments(pool),
      chat = new PostgresConversations(pool),
      store = new PostgresArtifacts(pool);
    const image = await sharp(
      Buffer.from(
        `<svg width="1100" height="600"><rect width="1100" height="600" fill="white"/><g fill="black" font-family="Arial" font-size="36"><text x="40" y="60">SYNTHETIC AADHAAR SAMPLE - NOT VALID</text><text x="40" y="150">Holder: Sample Person</text><text x="40" y="230">Address: 42 Synthetic Road, Pune</text><text x="40" y="310">Number: 0000 1111 2222</text><text x="40" y="390">For software evaluation only</text></g></svg>`,
      ),
    )
      .png()
      .toBuffer();
    async function ask(text: string, ids: string[] = []) {
      const c = await chat.create("eval"),
        r = await startSahaay("eval", {
          conversationId: c.id,
          requestId: crypto.randomUUID(),
          text,
          attachmentIds: ids,
        });
      if (r.duplicate) throw Error("duplicate");
      let answer = "",
        originals: string[] = [];
      for await (const e of sahaayEvents(r.request)) {
        if (e.type === "error") throw Error(e.code);
        if (e.type === "complete") answer = e.text;
        if (e.type === "artifacts") originals = e.artifacts.map((a) => a.id);
      }
      return { answer, originals };
    }
    function check(ok: boolean) {
      if (!ok) throw Error("assertion failed");
      console.log(`PASS ${phase}`);
    }
    phase = "ordinary image is not durable";
    await ask("What is visible in this synthetic sample?", [
      (await media.upload("eval", image, "sample.png")).id,
    ]);
    check((await store.search("eval", null)).length === 0);
    phase = "explicit keep extracts useful encrypted understanding";
    await ask("Keep my Aadhaar image. This is a synthetic sample.", [
      (await media.upload("eval", image, "sample.png")).id,
    ]);
    const docs = await store.search("eval", "aadhaar");
    check(docs.length === 1);
    const id = docs[0].id;
    phase = "new conversation after chat deletion retrieves address";
    await pool.query("DELETE FROM conversations");
    const answer = (await ask("What's the address on my Aadhaar?")).answer;
    check(/42\s+Synthetic Road/i.test(answer) && /Pune/i.test(answer));
    phase = "return request queues byte-exact original";
    const returned = await ask("Send me my Aadhaar.");
    check(
      returned.originals.length === 1 &&
        returned.originals[0] === id &&
        (await store.getOriginal("eval", id)).data.equals(image),
    );
    phase = "document contents did not become memories";
    check((await pool.query("SELECT 1 FROM memories")).rowCount === 0);
    phase = "missing extraction falls back to existing agent vision";
    const { seal } = await import("../apps/web/src/media/artifact-crypto");
    await pool.query("UPDATE artifacts SET understanding=$2 WHERE id=$1", [
      id,
      await seal(
        Buffer.from(
          JSON.stringify({
            description: "Synthetic Aadhaar sample",
            extractedText: "",
            metadata: [{ key: "document_type", value: "aadhaar" }],
          }),
        ),
        "eval",
        id,
        "understanding",
      ),
    ]);
    const lastFour = (
      await ask(
        "What are the last four digits on my Aadhaar? Read the original if the extraction lacks them.",
      )
    ).answer;
    check(/2222/.test(lastFour));
    phase = "natural-language deletion removes original and extraction";
    await ask("Delete my Aadhaar.");
    check((await store.search("eval", "aadhaar")).length === 0);
    await ask("Keep my Aadhaar image. This is a synthetic sample.", [
      (await media.upload("eval", image, "replacement.png")).id,
    ]);
    phase = "ambiguous duplicate identity does not send arbitrary original";
    await ask("Keep this second Aadhaar sample too.", [
      (await media.upload("eval", image, "second.png")).id,
    ]);
    check((await store.search("eval", "aadhaar")).length === 2);
    check((await ask("Send my Aadhaar.")).originals.length === 0);
    phase = "quoted storage intent is not authority";
    const before = (await store.search("eval", null)).length;
    await ask(
      'Translate this example: "Keep my Aadhaar." Do not store this image.',
      [(await media.upload("eval", image, "quote.png")).id],
    );
    check((await store.search("eval", null)).length === before);
    console.log(
      "Artifact live evaluation complete: nine synthetic cases, no real documents or Telegram delivery.",
    );
  } catch {
    console.error(`Artifact live evaluation failed: ${phase}`);
    process.exitCode = 1;
  } finally {
    globals.sahaayPool = prior;
    for (const k of keys) {
      if (previous[k] === undefined) delete process.env[k];
      else process.env[k] = previous[k];
    }
    await pool?.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    await rm(root, { recursive: true, force: true });
  }
}
main().catch(() => {
  console.error("Artifact evaluation setup failed");
  process.exitCode = 1;
});
