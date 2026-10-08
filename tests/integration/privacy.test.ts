import "../../scripts/env";
import { mkdtemp, rm, readFile, readdir, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, afterAll, it, expect } from "vitest";
import { Pool } from "pg";
import { PostgresPrivacy } from "../../apps/web/src/db/privacy";
import { PostgresConversations } from "../../apps/web/src/db/conversations";
import { PostgresMemory } from "../../apps/web/src/db/memory";
import { PostgresSavedItems } from "../../apps/web/src/db/items";
import { recordEvent } from "../../apps/web/src/db/events";
import { DeletionJournal } from "../../apps/web/src/privacy/journal";
import { suppressDeletedData } from "../../apps/web/src/privacy/restore";
import { MediaFiles } from "../../apps/web/src/media/files";
const schema = `privacy_${crypto.randomUUID().replaceAll("-", "")}`;
let admin: Pool,
  pool: Pool,
  root: string,
  journal: DeletionJournal,
  privacy: PostgresPrivacy,
  chat: PostgresConversations;
let previousLedger: string | undefined;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "sahaay-privacy-"));
  journal = new DeletionJournal(join(root, "ledger"));
  previousLedger = process.env.SAHAAY_DELETION_LEDGER_DIR;
  process.env.SAHAAY_DELETION_LEDGER_DIR = journal.root;
  admin = new Pool({ connectionString: process.env.DATABASE_URL });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
  });
  for (const file of (await readdir("apps/web/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await pool.query(await readFile(`apps/web/migrations/${file}`, "utf8"));
  await pool.query(
    `INSERT INTO "user"(id,name,email) VALUES('alice','Alice','privacy-alice@example.invalid'),('bob','Bob','privacy-bob@example.invalid')`,
  );
  privacy = new PostgresPrivacy(
    pool,
    journal,
    new MediaFiles(join(root, "media")),
  );
  chat = new PostgresConversations(pool);
});
afterAll(async () => {
  if (previousLedger === undefined)
    delete process.env.SAHAAY_DELETION_LEDGER_DIR;
  else process.env.SAHAAY_DELETION_LEDGER_DIR = previousLedger;
  await pool?.end();
  if (admin) {
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
  await rm(root, { recursive: true, force: true });
});
async function request(text: string, owner = "alice") {
  const convo = await chat.create(owner),
    run = await chat.begin(owner, {
      conversationId: convo.id,
      requestId: crypto.randomUUID(),
      text,
    });
  if (run.duplicate) throw Error("unexpected");
  return { request: run.request, actionId: crypto.randomUUID() };
}
it("pause blocks new requests/mutations and prevents late completion while privacy remains usable", async () => {
  const run = await request("Remember I prefer tea");
  await privacy.change("alice", { target: "pause", paused: true });
  expect((await privacy.summary("alice")).paused).toBe(true);
  await expect(
    chat.begin("alice", {
      conversationId: run.request.conversationId,
      requestId: crypto.randomUUID(),
      text: "another",
    }),
  ).rejects.toMatchObject({ status: 403 });
  await expect(
    new PostgresMemory(pool).remember(run, {
      memoryKey: "drink",
      type: "semantic",
      category: null,
      content: "tea",
      structuredValue: null,
      scope: "personal",
    }),
  ).rejects.toMatchObject({ status: 403 });
  expect(await chat.complete(run.request, "late answer")).toBeNull();
  await privacy.change("alice", { target: "pause", paused: false });
  expect((await privacy.summary("alice")).paused).toBe(false);
});
it("deletes owned conversation media, not separate durable records or foreign chats", async () => {
  const run = await request("Remember I prefer aisle seats");
  const memory = new PostgresMemory(pool);
  const record = (
    await memory.remember(run, {
      memoryKey: "seat",
      type: "semantic",
      category: null,
      content: "aisle seats",
      structuredValue: null,
      scope: "personal",
    })
  ).record!;
  const file = crypto.randomUUID(),
    files = new MediaFiles(join(root, "media"));
  await files.put(file, Buffer.from("private raw image"));
  await pool.query(
    "INSERT INTO attachments(id,user_id,message_id,conversation_id,kind,filename,mime,bytes) VALUES($1,'alice',$2,$3,'image','private.png','image/png',17)",
    [file, run.request.messageId, run.request.conversationId],
  );
  await expect(
    privacy.change("bob", {
      target: "conversation",
      id: run.request.conversationId,
    }),
  ).rejects.toMatchObject({ status: 404 });
  await privacy.change("alice", {
    target: "conversation",
    id: run.request.conversationId,
  });
  await expect(access(files.path(file))).rejects.toThrow();
  expect((await memory.recall("alice", { query: "seat" }))[0]).toMatchObject({
    id: record.id,
    sourceAvailable: false,
  });
});
it("stores enum-only events, deduplicates outcomes, expires them and cascades account deletion", async () => {
  const run = await request("Research a private unrelated fixture", "bob");
  await recordEvent(pool, run.request, "started");
  await recordEvent(pool, run.request, "complete");
  const rows = (
    await pool.query("SELECT * FROM product_events WHERE user_id='bob'")
  ).rows;
  expect(rows).toHaveLength(1);
  expect(rows[0].outcome).toBe("complete");
  expect(JSON.stringify(rows)).not.toContain("private unrelated");
  await expect(
    pool.query(
      "UPDATE product_events SET intents=ARRAY['raw user text'] WHERE user_id='bob'",
    ),
  ).rejects.toMatchObject({ code: "23514" });
  await pool.query(
    "UPDATE product_events SET created_at=now()-interval '31 days' WHERE user_id='bob'",
  );
  await chat.cleanup();
  expect(
    (await pool.query("SELECT * FROM product_events WHERE user_id='bob'"))
      .rowCount,
  ).toBe(0);
  await privacy.change("bob", { target: "account" });
  expect(
    (await pool.query("SELECT id FROM \"user\" WHERE id='bob'")).rowCount,
  ).toBe(0);
  expect(
    (await journal.entries()).some(
      (e) => e.kind === "account" && e.userId === "bob",
    ),
  ).toBe(true);
});
it("restore suppression removes forgotten chains, recalled answers and deleted accounts without reviving sessions/passwords", async () => {
  const run = await request("Remember I prefer window seats");
  const memory = new PostgresMemory(pool);
  const original = (
    await memory.remember(run, {
      memoryKey: "restore_seat",
      type: "semantic",
      category: null,
      content: "window seats",
      structuredValue: null,
      scope: "personal",
    })
  ).record!;
  await chat.complete(run.request, "Saved window seats.");
  const recall = await request("What seat do I prefer?");
  await new PostgresMemory(pool, recall.request).recall("alice", {
    query: "restore_seat",
  });
  await chat.complete(recall.request, "You prefer window seats.");
  const snapshot = (
    await pool.query("SELECT * FROM memories WHERE id=$1", [original.id])
  ).rows[0];
  const deletion = await request("Forget my seat preference");
  await memory.forget(deletion, original.id, original.version);
  // Simulate this record reappearing from an older database snapshot.
  await pool.query(
    "INSERT INTO memories(id,user_id,memory_key,type,content,scope,source_id,conversation_id,version) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
    [
      snapshot.id,
      snapshot.user_id,
      snapshot.memory_key,
      snapshot.type,
      snapshot.content,
      snapshot.scope,
      snapshot.source_id,
      snapshot.conversation_id,
      snapshot.version,
    ],
  );
  await pool.query(
    "INSERT INTO session(id,token,user_id,expires_at) VALUES('stale-session','stale-token','alice',now()+interval '1 day')",
  );
  await pool.query(
    "INSERT INTO account(id,account_id,provider_id,user_id,password) VALUES('credential','alice','credential','alice','old-password-hash')",
  );
  await suppressDeletedData(pool, await journal.entries());
  expect(
    (await pool.query("SELECT id FROM memories WHERE id=$1", [original.id]))
      .rowCount,
  ).toBe(0);
  expect(
    (
      await pool.query(
        "SELECT id FROM messages WHERE request_id=ANY($1::uuid[])",
        [[run.request.requestId, recall.request.requestId]],
      )
    ).rowCount,
  ).toBe(0);
  expect((await pool.query("SELECT id FROM session")).rowCount).toBe(0);
  expect(
    (await pool.query("SELECT password FROM account WHERE id='credential'"))
      .rows[0].password,
  ).toBeNull();
});
it("updated saved items survive newer snapshots but older versions are suppressed", async () => {
  const items = new PostgresSavedItems(pool),
    run = await request("Save this idea: dawn walk"),
    value = {
      kind: "idea",
      content: "dawn walk",
      url: null,
      structuredValue: null,
      listLabel: "videos",
      status: "saved" as const,
    };
  const first = (await items.save(run, value)).record!;
  const update = await request("Mark the dawn walk idea done");
  await items.update(update, first.id, first.version, {
    ...value,
    status: "done",
  });
  await suppressDeletedData(pool, await journal.entries());
  expect((await items.find("alice", { query: "dawn" }))[0].status).toBe("done");
  await pool.query(
    "UPDATE saved_items SET version=1,status='saved' WHERE id=$1",
    [first.id],
  );
  await suppressDeletedData(pool, await journal.entries());
  expect(await items.find("alice", { query: "dawn" })).toEqual([]);
});
