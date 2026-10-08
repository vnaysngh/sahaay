import "../../scripts/env";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { beforeAll, afterAll, it, expect } from "vitest";
import { PostgresConversations } from "../../apps/web/src/db/conversations";
import { PostgresSavedItems } from "../../apps/web/src/db/items";
import { PostgresMemory } from "../../apps/web/src/db/memory";
import { lifeState } from "../../apps/web/src/db/life-state";
import { suppressDeletedData } from "../../apps/web/src/privacy/restore";
import { DeletionJournal } from "../../apps/web/src/privacy/journal";
import type { MutationContext } from "../../apps/web/src/core/memory";
import type { ItemInput } from "../../apps/web/src/core/items";
const schema = `state_${crypto.randomUUID().replaceAll("-", "")}`;
let pool: Pool,
  admin: Pool,
  chat: PostgresConversations,
  items: PostgresSavedItems,
  root: string;
const ledger = process.env.SAHAAY_DELETION_LEDGER_DIR;
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "sahaay-state-"));
  process.env.SAHAAY_DELETION_LEDGER_DIR = root;
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
    `INSERT INTO "user"(id,name,email) VALUES('alice','Alice','state-a@example.invalid'),('bob','Bob','state-b@example.invalid')`,
  );
  chat = new PostgresConversations(pool);
  items = new PostgresSavedItems(pool);
});
afterAll(async () => {
  if (ledger === undefined) delete process.env.SAHAAY_DELETION_LEDGER_DIR;
  else process.env.SAHAAY_DELETION_LEDGER_DIR = ledger;
  await pool?.end();
  await admin?.query(`DROP SCHEMA "${schema}" CASCADE`);
  await admin?.end();
  await rm(root, { recursive: true, force: true });
});
async function request(
  text: string,
  owner = "alice",
): Promise<MutationContext> {
  const c = await chat.create(owner);
  const r = await chat.begin(owner, {
    conversationId: c.id,
    requestId: crypto.randomUUID(),
    text,
  });
  if (r.duplicate) throw Error("unexpected");
  return {
    request: r.request,
    actionId: crypto.randomUUID(),
    reviewItemIntent: async () => true,
  };
}
const plan: ItemInput = {
  recordRole: "object",
  parentId: null,
  stateLabel: "planning",
  kind: "trip",
  content: "Japan trip",
  url: null,
  structuredValue: { details: "December" },
  listLabel: null,
  status: "saved",
};
it("natural declarations create typed objects, link separately owned items, and preserve preferences", async () => {
  const ctx = await request("I'm thinking about Japan in December");
  const a = (await items.save(ctx, plan)).record!;
  expect(a).toMatchObject({
    recordRole: "object",
    stateLabel: "planning",
    parentId: null,
    sourceId: ctx.request.messageId,
  });
  expect((await items.save(ctx, plan)).outcome).toBe("replayed");
  const hotel = (
    await items.save(await request("Save this hotel for that trip"), {
      ...plan,
      recordRole: "item",
      parentId: a.id,
      kind: "hotel",
      content: "Kyoto hotel",
      stateLabel: "considering",
      structuredValue: null,
    })
  ).record!;
  expect(await items.find("alice", { query: null, parentId: a.id })).toEqual([
    expect.objectContaining({ id: hotel.id }),
  ]);
  expect(await items.find("alice", { query: "Japan" })).toEqual([]);
  expect(
    await items.find("bob", { query: null, recordRole: "object" }),
  ).toEqual([]);
  expect(
    await new PostgresMemory(pool).recall("alice", { query: "Japan" }),
  ).toEqual([]);
  expect((await lifeState(pool, "alice", a.id))!.records[0].id).toBe(hotel.id);
  expect(await lifeState(pool, "bob", a.id)).toBeNull();
  expect(
    await new PostgresSavedItems(pool, ctx.request).inspect("alice", a.id),
  ).toMatchObject({
    object: { id: a.id },
    items: [{ id: hotel.id }],
    totalItems: 1,
  });
  expect(await items.inspect("bob", a.id)).toBeNull();
  const events = JSON.stringify(
    (await pool.query("SELECT * FROM product_events")).rows,
  );
  expect(events).toContain("state_created");
  expect(events).toContain("saved_item_created");
  expect(events).toContain("state_revisited");
  expect(events).not.toMatch(/Japan|Kyoto|December/);
});
it("review denial cannot be bypassed by a save keyword, invented fields or image instructions", async () => {
  for (const text of [
    'Explain "Save my Japan trip"',
    "Don’t save this: I am going to Japan",
    "What is a good Japan itinerary?",
  ]) {
    const ctx = await request(text);
    ctx.reviewItemIntent = async (_proposal, direct) => {
      expect(direct).toBe(text);
      return false;
    };
    await expect(items.save(ctx, plan)).rejects.toMatchObject({ status: 403 });
  }
  const ctx = await request("Save my Japan trip");
  delete ctx.reviewItemIntent;
  await expect(items.save(ctx, plan)).rejects.toMatchObject({ status: 403 });
});
it("same-owner parent constraint, immutable roles and one-level objects are enforced", async () => {
  const p = (
    await items.find("alice", { query: "Japan", recordRole: "object" })
  )[0];
  await expect(
    items.save(await request("Save a hotel", "bob"), {
      ...plan,
      recordRole: "item",
      parentId: p.id,
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    items.save(await request("Add a nested plan"), { ...plan, parentId: p.id }),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    pool.query("UPDATE saved_items SET record_role='item' WHERE id=$1", [p.id]),
  ).rejects.toMatchObject({ code: "23514" });
  await expect(
    pool.query(
      `INSERT INTO saved_items(user_id,kind,content,source_id,conversation_id,parent_id) VALUES('bob','hotel','foreign',gen_random_uuid(),gen_random_uuid(),$1)`,
      [p.id],
    ),
  ).rejects.toMatchObject({ code: "23514" });
  const child = (await items.find("alice", { query: null, parentId: p.id }))[0];
  await expect(
    items.save(await request("Save another hotel"), {
      ...plan,
      recordRole: "item",
      parentId: child.id,
    }),
  ).rejects.toMatchObject({ status: 404 });
});
it("voice review uses current owned transcripts and pause during review prevents commit", async () => {
  const ctx = await request("");
  await pool.query(
    `INSERT INTO attachments(id,user_id,message_id,conversation_id,kind,filename,mime,bytes,transcript) VALUES('00000000-0000-4000-8000-000000000001','alice',$1,$2,'audio','v.wav','audio/wav',100,'I am planning a pottery project'),('00000000-0000-4000-8000-000000000002','alice',$1,$2,'audio','v2.wav','audio/wav',100,'for November')`,
    [ctx.request.messageId, ctx.request.conversationId],
  );
  ctx.reviewItemIntent = async (_proposal, text) => {
    expect(text).toBe("I am planning a pottery project\nfor November");
    return true;
  };
  expect(
    (
      await items.save(ctx, {
        ...plan,
        kind: "project",
        content: "Pottery project",
        structuredValue: { details: "November" },
      })
    ).outcome,
  ).toBe("committed");
  const paused = await request("I am planning a painting project");
  paused.reviewItemIntent = async () => {
    await pool.query(
      `UPDATE "user" SET processing_paused=true WHERE id='alice'`,
    );
    return true;
  };
  await expect(
    items.save(paused, { ...plan, content: "Painting project" }),
  ).rejects.toMatchObject({ status: 403 });
  await pool.query(
    `UPDATE "user" SET processing_paused=false WHERE id='alice'`,
  );
});
it("versions prevent stale updates and corrected objects survive source expiration", async () => {
  const a = (
    await items.find("alice", { query: "Japan", recordRole: "object" })
  )[0];
  const ctx = await request("Move Japan to January");
  const b = (
    await items.update(ctx, a.id, a.version, {
      ...plan,
      structuredValue: { details: "January" },
    })
  ).record!;
  await expect(
    items.update(
      { ...ctx, actionId: crypto.randomUUID() },
      a.id,
      a.version,
      plan,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await chat.complete(ctx.request, "Moved Japan to January.");
  await pool.query("DELETE FROM conversations WHERE user_id='alice'");
  expect(
    (await items.find("alice", { query: "Japan", recordRole: "object" }))[0],
  ).toMatchObject({
    id: b.id,
    version: 2,
    sourceAvailable: false,
    structuredValue: { details: "January" },
  });
});
it("object deletion keeps children and restore suppression cannot recreate the object or link", async () => {
  const p = (
    await items.find("alice", { query: "Japan", recordRole: "object" })
  )[0];
  const child = (await items.find("alice", { query: null, parentId: p.id }))[0];
  await items.remove(await request("Delete my Japan trip"), p.id, p.version);
  expect((await items.find("alice", { query: "Kyoto" }))[0]).toMatchObject({
    id: child.id,
    parentId: null,
  });
  // Simulate an older backup of the object + its relationship.
  await pool.query(
    `INSERT INTO saved_items(id,user_id,kind,content,record_role,state_label,source_id,conversation_id) VALUES($1,'alice','trip','Japan trip','object','planning',gen_random_uuid(),gen_random_uuid())`,
    [p.id],
  );
  await pool.query("UPDATE saved_items SET parent_id=$1 WHERE id=$2", [
    p.id,
    child.id,
  ]);
  await suppressDeletedData(pool, await new DeletionJournal(root).entries());
  expect(
    await items.find("alice", { query: "Japan", recordRole: "object" }),
  ).toEqual([]);
  expect(
    (await items.find("alice", { query: "Kyoto" }))[0].parentId,
  ).toBeNull();
});
it("legacy saved items keep their role and deleting an account removes objects, items and analytics", async () => {
  const ctx = await request("Save my video idea", "bob");
  delete ctx.reviewItemIntent;
  const a = (
    await items.save(ctx, {
      kind: "idea",
      content: "A city walk",
      url: null,
      structuredValue: null,
      listLabel: "videos",
      status: "saved",
    })
  ).record!;
  expect(a.recordRole).toBe("item");
  expect(a.parentId).toBeNull();
  await items.save(await request("I am considering a bike", "bob"), {
    ...plan,
    kind: "purchase",
    content: "Bike",
    recordRole: "item",
    stateLabel: "considering",
  });
  await items.save(await request("I am planning a garden", "bob"), {
    ...plan,
    kind: "project",
    content: "Garden",
  });
  await pool.query(`DELETE FROM "user" WHERE id='bob'`);
  expect(
    (await pool.query("SELECT 1 FROM saved_items WHERE user_id='bob'"))
      .rowCount,
  ).toBe(0);
  expect(
    (await pool.query("SELECT 1 FROM product_events WHERE user_id='bob'"))
      .rowCount,
  ).toBe(0);
});
