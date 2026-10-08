import "../../scripts/env";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { Attachments } from "../../apps/web/src/media/attachments";
import { PostgresArtifacts } from "../../apps/web/src/db/artifacts";
import { PostgresConversations } from "../../apps/web/src/db/conversations";
import { TelegramAdapter } from "../../apps/web/src/channels/telegram/adapter";
import { TelegramApi } from "../../apps/web/src/channels/telegram/api";
import { startSahaay, sahaayEvents } from "../../apps/web/src/core/runtime";
import { PostgresSavedItems } from "../../apps/web/src/db/items";
import { suppressDeletedData } from "../../apps/web/src/privacy/restore";
import { DeletionJournal } from "../../apps/web/src/privacy/journal";
import { imageFixture } from "../fixtures";
import type { MutationContext } from "../../apps/web/src/core/memory";
import type { ArtifactInput } from "../../apps/web/src/core/artifacts";
const schema = `artifacts_${crypto.randomUUID().replaceAll("-", "")}`;
let pool: Pool,
  admin: Pool,
  root: string,
  media: Attachments,
  store: PostgresArtifacts,
  chat: PostgresConversations;
const globals = globalThis as typeof globalThis & { sahaayPool?: Pool };
let priorPool: Pool | undefined;
const keys = [
    "SAHAAY_E2E",
    "SAHAAY_MEDIA_DIR",
    "SAHAAY_DELETION_LEDGER_DIR",
  ] as const,
  previous = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "sahaay-artifacts-"));
  process.env.SAHAAY_E2E = "1";
  process.env.SAHAAY_MEDIA_DIR = join(root, "media");
  process.env.SAHAAY_DELETION_LEDGER_DIR = join(root, "journal");
  admin = new Pool({ connectionString: process.env.DATABASE_URL });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
  });
  for (const f of (await readdir("apps/web/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await pool.query(await readFile(`apps/web/migrations/${f}`, "utf8"));
  await pool.query(
    `INSERT INTO "user"(id,name,email,email_verified) VALUES('alice','Synthetic','artifact-a@example.invalid',true),('bob','Synthetic','artifact-b@example.invalid',true)`,
  );
  media = new Attachments(pool);
  store = new PostgresArtifacts(pool);
  chat = new PostgresConversations(pool);
  priorPool = globals.sahaayPool;
  globals.sahaayPool = pool;
});
beforeEach(async () => {
  await pool.query(
    `INSERT INTO "user"(id,name,email,email_verified) VALUES('alice','Synthetic','artifact-a@example.invalid',true),('bob','Synthetic','artifact-b@example.invalid',true) ON CONFLICT(id) DO NOTHING`,
  );
  await pool.query("DELETE FROM artifacts");
  await pool.query("DELETE FROM conversations");
  await pool.query("DELETE FROM attachments");
  await pool.query("DELETE FROM record_mutations");
  await pool.query("DELETE FROM product_events");
  await pool.query("DELETE FROM telegram_links");
  await pool.query("DELETE FROM saved_items");
});
afterAll(async () => {
  globals.sahaayPool = priorPool;
  for (const k of keys) {
    if (previous[k] === undefined) delete process.env[k];
    else process.env[k] = previous[k];
  }
  await pool?.end();
  await admin?.query(`DROP SCHEMA "${schema}" CASCADE`);
  await admin?.end();
  await rm(root, { recursive: true, force: true });
});
const base: Omit<ArtifactInput, "attachmentId"> = {
  title: "Aadhaar Card",
  category: "identity_document",
  description: "Synthetic identity card",
  extractedText: "Address: 42 Synthetic Road, Pune; 0000 1111 2222",
  metadata: [
    { key: "document_type", value: "aadhaar" },
    { key: "address", value: "42 Synthetic Road, Pune" },
    { key: "aadhaar_number", value: "000011112222" },
    { key: "last_four", value: "2222" },
  ],
  relatedItemId: null,
};
async function current(
  text = "Keep my Aadhaar.",
  owner = "alice",
  upload = true,
): Promise<{ ctx: MutationContext; id: string; data: Buffer }> {
  const data = await imageFixture(),
    id = upload ? (await media.upload(owner, data, "synthetic.png")).id : "",
    c = await chat.create(owner),
    r = await chat.begin(owner, {
      conversationId: c.id,
      requestId: crypto.randomUUID(),
      text,
      attachmentIds: upload ? [id] : [],
    });
  if (r.duplicate) throw Error("duplicate");
  return {
    ctx: {
      request: r.request,
      actionId: crypto.randomUUID(),
      reviewItemIntent: async () => true,
    },
    id,
    data,
  };
}
async function kept() {
  const c = await current(),
    r = await store.create(c.ctx, { ...base, attachmentId: c.id });
  return { ...c, artifact: r.record! };
}
async function web(text: string) {
  const c = await chat.create("alice"),
    r = await startSahaay("alice", {
      conversationId: c.id,
      requestId: crypto.randomUUID(),
      text,
    });
  if (r.duplicate) throw Error();
  let answer = "";
  for await (const e of sahaayEvents(r.request)) {
    expect(e.type).not.toBe("error");
    if (e.type === "complete") answer = e.text;
  }
  return answer;
}
let seq = 1;
function update(text: string, file = false) {
  const id = seq++;
  return {
    update_id: id,
    message: {
      message_id: id,
      date: Math.floor(Date.now() / 1000),
      from: { id: 101, is_bot: false },
      chat: { id: 101, type: "private" },
      ...(file
        ? {
            caption: text,
            photo: [
              { file_id: "synthetic", width: 240, height: 160, file_size: 500 },
            ],
          }
        : { text }),
    },
  };
}
async function adapter() {
  await pool.query(
    `INSERT INTO telegram_links(telegram_user_id,user_id) VALUES('101','alice')`,
  );
  const original = await imageFixture(),
    sent: Buffer[] = [];
  const api = new TelegramApi("123:synthetic", async (url, init) => {
    if (String(url).includes("/file/bot"))
      return new Response(new Uint8Array(original));
    if (init?.body instanceof FormData) {
      const file = init.body.get("document") as Blob;
      sent.push(Buffer.from(await file.arrayBuffer()));
      return Response.json({ ok: true, result: { message_id: seq++ } });
    }
    const method = String(url).split("/").at(-1);
    return Response.json({
      ok: true,
      result:
        method === "getFile"
          ? { file_path: "fixture.png" }
          : { message_id: seq++ },
    });
  });
  return {
    adapter: new TelegramAdapter(pool, api, "123", "http://localhost:3000"),
    original,
    sent,
  };
}
it("A/B/C/D/E: Telegram keeps received image, Web sees it, fresh conversations retrieve fields and byte-exact original", async () => {
  const a = await adapter();
  await a.adapter.handle(update("Keep my Aadhaar.", true));
  const rows = await store.search("alice", null);
  expect(rows).toHaveLength(1);
  expect(rows[0].title).toBe("Aadhaar Card");
  expect(JSON.stringify(rows)).not.toMatch(/Synthetic Road|0000|2222/);
  await pool.query("DELETE FROM conversations");
  expect(await web("What's the address on my Aadhaar?")).toContain(
    "42 Synthetic Road, Pune",
  );
  await a.adapter.handle(update("Send me my Aadhaar."));
  expect(a.sent).toEqual([a.original]);
  const file = await store.getOriginal("alice", rows[0].id);
  expect(file.data).toEqual(a.original);
  expect(file.artifact.mime).toBe("image/png");
  expect(await web("What documents do you have for me?")).toBe("Aadhaar Card");
  expect((await pool.query("SELECT 1 FROM memories")).rowCount).toBe(0);
  expect((await pool.query("SELECT 1 FROM saved_items")).rowCount).toBe(0);
});
it("D: Web-kept artifact is returned through Telegram without channel-specific storage", async () => {
  const a = await adapter(),
    c = await current();
  for await (const e of sahaayEvents(c.ctx.request))
    expect(e.type).not.toBe("error");
  await a.adapter.handle(update("Send me my Aadhaar."));
  expect(a.sent).toEqual([c.data]);
});
it("F: delete removes durable original/extraction/temp upload and suppresses older backups", async () => {
  const k = await kept(),
    snapshot = (
      await pool.query("SELECT * FROM artifacts WHERE id=$1", [k.artifact.id])
    ).rows[0];
  await store.delete(
    (await current("Delete my Aadhaar.", "alice", false)).ctx,
    k.artifact.id,
    1,
  );
  expect(await store.search("alice", null)).toEqual([]);
  await expect(store.getOriginal("alice", k.artifact.id)).rejects.toMatchObject(
    { status: 404 },
  );
  expect(
    (await pool.query("SELECT 1 FROM attachments WHERE id=$1", [k.id]))
      .rowCount,
  ).toBe(0);
  await expect(media.files.read(k.id)).rejects.toMatchObject({
    code: "ENOENT",
  });
  await pool.query(
    "INSERT INTO artifacts SELECT * FROM jsonb_populate_record(NULL::artifacts,$1::jsonb)",
    [
      JSON.stringify({
        ...snapshot,
        original: "\\x" + snapshot.original.toString("hex"),
        understanding: "\\x" + snapshot.understanding.toString("hex"),
      }),
    ],
  );
  await suppressDeletedData(
    pool,
    await new DeletionJournal(join(root, "journal")).entries(),
  );
  expect(await store.search("alice", null)).toEqual([]);
});
it("G mandatory: all reads/originals/deletes and attachment promotion reject another owner", async () => {
  const k = await kept();
  expect(await store.search("bob", "aadhaar")).toEqual([]);
  await expect(store.get("bob", k.artifact.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(store.getOriginal("bob", k.artifact.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(store.deleteWeb("bob", k.artifact.id, 1)).rejects.toMatchObject({
    status: 404,
  });
  const c = await current("Keep this", "bob", false);
  await expect(
    store.create(c.ctx, { ...base, attachmentId: k.id }),
  ).rejects.toMatchObject({ status: 410 });
});
it("H: similar documents ask for narrowing and send nothing", async () => {
  const a = await adapter();
  await a.adapter.handle(update("Keep this invoice.", true));
  await a.adapter.handle(update("Keep this invoice.", true));
  expect(await store.search("alice", "invoice")).toHaveLength(2);
  await a.adapter.handle(update("Send my invoice."));
  expect(a.sent).toEqual([]);
});
it("ordinary images remain temporary; keep requires authorized current intent and an available original", async () => {
  const c = await current("Explain this image");
  expect(await store.search("alice", null)).toEqual([]);
  c.ctx.reviewItemIntent = async () => false;
  await expect(
    store.create(c.ctx, { ...base, attachmentId: c.id }),
  ).rejects.toMatchObject({ status: 403 });
  delete c.ctx.reviewItemIntent;
  await expect(
    store.create(c.ctx, { ...base, attachmentId: c.id }),
  ).rejects.toMatchObject({ status: 403 });
  await pool.query(
    "UPDATE attachments SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [c.id],
  );
  await media.cleanup();
  expect(
    (
      await pool.query("SELECT original_image FROM attachments WHERE id=$1", [
        c.id,
      ])
    ).rows[0].original_image,
  ).toBeNull();
  c.ctx.reviewItemIntent = async () => true;
  await expect(
    store.create(c.ctx, { ...base, attachmentId: c.id }),
  ).rejects.toMatchObject({ status: 410 });
});
it("durable images survive temporary media expiry, are encrypted at rest, and receipt retries do not duplicate", async () => {
  const k = await kept();
  expect(
    (await store.create(k.ctx, { ...base, attachmentId: k.id })).outcome,
  ).toBe("replayed");
  await pool.query("UPDATE attachments SET expires_at=now()-interval '1 day'");
  await media.cleanup();
  await pool.query("DELETE FROM conversations");
  expect((await store.getOriginal("alice", k.artifact.id)).data).toEqual(
    k.data,
  );
  const row = (
    await pool.query(
      "SELECT original,understanding FROM artifacts WHERE id=$1",
      [k.artifact.id],
    )
  ).rows[0];
  expect(row.original).not.toEqual(k.data);
  expect(row.understanding.toString()).not.toContain("Synthetic Road");
  const record = await store.get("alice", k.artifact.id);
  expect(record.extractedText).not.toContain("0000 1111 2222");
  expect(record.metadata.some((m) => m.key === "aadhaar_number")).toBe(false);
  expect((await pool.query("SELECT 1 FROM message_artifacts")).rowCount).toBe(
    0,
  );
  const events = JSON.stringify(
    (await pool.query("SELECT * FROM product_events")).rows,
  );
  expect(events).not.toContain("Synthetic Road");
  expect(events).not.toContain("2222");
});
it("state links enforce ownership and detach cleanly; deleting account cascades durable bytes", async () => {
  const k = await current(),
    plan = (
      await new PostgresSavedItems(pool).save(
        { ...k.ctx, actionId: crypto.randomUUID() },
        {
          recordRole: "object",
          parentId: null,
          stateLabel: "planning",
          kind: "trip",
          content: "Japan",
          url: null,
          structuredValue: null,
          listLabel: null,
          status: "saved",
        },
      )
    ).record!;
  const a = (
    await store.create(k.ctx, {
      ...base,
      attachmentId: k.id,
      relatedItemId: plan.id,
    })
  ).record!;
  await pool.query("DELETE FROM saved_items WHERE id=$1", [plan.id]);
  expect((await store.get("alice", a.id)).relatedItemId).toBeNull();
  await pool.query(`DELETE FROM "user" WHERE id='alice'`);
  expect((await pool.query("SELECT 1 FROM artifacts")).rowCount).toBe(0);
});

it("Web deletion suppresses source and artifact-derived turns from future context", async () => {
  const k = await kept();
  await chat.complete(k.ctx.request, "Kept your image.");
  const turn = await current(
    "What's the address on my Aadhaar?",
    "alice",
    false,
  );
  await new PostgresArtifacts(pool, turn.ctx.request).get(
    "alice",
    k.artifact.id,
  );
  await chat.complete(turn.ctx.request, "42 Synthetic Road, Pune");
  await store.deleteWeb("alice", k.artifact.id, 1);
  const next = await chat.begin("alice", {
    conversationId: turn.ctx.request.conversationId,
    requestId: crypto.randomUUID(),
    text: "Do you have that document?",
  });
  if (next.duplicate) throw Error();
  const context = await chat.context(
    "alice",
    next.request.conversationId,
    next.request.messageId,
  );
  expect(JSON.stringify(context)).not.toContain("Synthetic Road");
  expect(
    (
      await pool.query("SELECT 1 FROM messages WHERE request_id=$1", [
        turn.ctx.request.requestId,
      ])
    ).rowCount,
  ).toBe(2);
  await suppressDeletedData(
    pool,
    await new DeletionJournal(join(root, "journal")).entries(),
  );
  expect(
    (
      await pool.query("SELECT 1 FROM messages WHERE request_id=$1", [
        turn.ctx.request.requestId,
      ])
    ).rowCount,
  ).toBe(0);
});
