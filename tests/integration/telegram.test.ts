import "../../scripts/env";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { beforeAll, afterAll, it, expect } from "vitest";
import { TelegramStore } from "../../apps/web/src/channels/telegram/store";
import { TelegramAdapter } from "../../apps/web/src/channels/telegram/adapter";
import { TelegramApi } from "../../apps/web/src/channels/telegram/api";
import { PostgresConversations } from "../../apps/web/src/db/conversations";
import { PostgresMemory } from "../../apps/web/src/db/memory";
import { PostgresSavedItems } from "../../apps/web/src/db/items";
import { suppressDeletedData } from "../../apps/web/src/privacy/restore";
import { lifeState } from "../../apps/web/src/db/life-state";
import { imageFixture, audioFixture } from "../fixtures";
const schema = `telegram_${crypto.randomUUID().replaceAll("-", "")}`;
let admin: Pool, pool: Pool, store: TelegramStore, root: string;
const globals = globalThis as typeof globalThis & { sahaayPool?: Pool };
let previousPool: Pool | undefined;
const envKeys = [
  "SAHAAY_E2E",
  "SAHAAY_MEDIA_DIR",
  "SAHAAY_DELETION_LEDGER_DIR",
] as const;
const previous = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "sahaay-telegram-"));
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
    `INSERT INTO "user"(id,name,email) VALUES('alice','Alice','telegram-alice@example.invalid'),('bob','Bob','telegram-bob@example.invalid')`,
  );
  store = new TelegramStore(pool);
  previousPool = globals.sahaayPool;
  globals.sahaayPool = pool;
  process.env.SAHAAY_E2E = "1";
  process.env.SAHAAY_MEDIA_DIR = join(root, "media");
  process.env.SAHAAY_DELETION_LEDGER_DIR = join(root, "ledger");
});
afterAll(async () => {
  globals.sahaayPool = previousPool;
  for (const key of envKeys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
  await pool?.end();
  if (admin) {
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
  await rm(root, { recursive: true, force: true });
});
let updateId = 1;
function update(text: string, id = 101) {
  return {
    update_id: updateId++,
    message: {
      message_id: updateId,
      date: Math.floor(Date.now() / 1000),
      from: { id, is_bot: false },
      chat: { id, type: "private" },
      text,
    },
  };
}
function transport() {
  const calls: Array<{ method: string; body: Record<string, unknown> }> = [];
  let messageId = 1;
  let binary: Buffer = audioFixture();
  const api = new TelegramApi("123:synthetic-only", async (input, init) => {
    const url = String(input);
    if (url.includes("/file/bot")) return new Response(new Uint8Array(binary));
    const method = url.split("/").at(-1)!;
    const body = JSON.parse(String(init?.body));
    calls.push({ method, body });
    return Response.json({
      ok: true,
      result:
        method === "getFile"
          ? { file_path: "uploads/fixture.dat" }
          : { message_id: messageId++ },
    });
  });
  return {
    api,
    calls,
    setBinary: (value: Buffer) => {
      binary = value;
    },
  };
}
it("single-use linking preserves internal identity and prevents cross-account takeover", async () => {
  const code = await store.issue("alice");
  const raw = JSON.stringify(
    (await pool.query("SELECT * FROM telegram_link_codes")).rows,
  );
  expect(raw).not.toContain(code);
  expect(await store.link("101", code)).toBe("alice");
  expect((await store.identity("101"))?.user_id).toBe("alice");
  await expect(store.link("102", code)).rejects.toMatchObject({ status: 400 });
  const bobCode = await store.issue("bob");
  await expect(store.link("101", bobCode)).rejects.toMatchObject({
    status: 409,
  });
  await store.link("102", bobCode);
  const expired = await store.issue("alice");
  await pool.query(
    "UPDATE telegram_link_codes SET expires_at=now()-interval '1 minute' WHERE user_id='alice'",
  );
  await expect(store.link("103", expired)).rejects.toMatchObject({
    status: 400,
  });
});
it("Telegram and Web reuse the same persisted conversation, memories and items; duplicates do not rerun tools", async () => {
  const t = transport(),
    adapter = new TelegramAdapter(pool, t.api, "123", "http://localhost:3000");
  const first = update("Remember I prefer aisle seats on flights.");
  await adapter.handle(first);
  const sends = t.calls.filter((c) => c.method === "sendMessage").length;
  await adapter.handle(first);
  expect(t.calls.filter((c) => c.method === "sendMessage")).toHaveLength(sends);
  expect(
    (
      await new PostgresMemory(pool).recall("alice", {
        query: "flight_seat_preference",
      })
    )[0].content,
  ).toContain("aisle");
  const link = (await store.identity("101"))!;
  expect(
    (
      await new PostgresConversations(pool).history(
        "alice",
        link.conversation_id!,
      )
    ).at(-1)?.content,
  ).toContain("Remembered");
  await adapter.handle(update("/new"));
  await adapter.handle(update("What is my preferred flight seat?"));
  expect(t.calls.at(-1)?.body.text).toContain("aisle");
  await adapter.handle(
    update(
      "Save this video idea and simulate research failure: a quiet city walk at dawn.",
    ),
  );
  expect(
    await new PostgresSavedItems(pool).find("alice", { query: "city" }),
  ).toHaveLength(1);
  expect(
    await new PostgresMemory(pool).recall("bob", {
      query: "flight_seat_preference",
    }),
  ).toEqual([]);
});
it("URLs use shared research with real source records, while images/voice use existing owned normalization", async () => {
  const t = transport(),
    adapter = new TelegramAdapter(pool, t.api, "123", "http://localhost:3000");
  await adapter.handle(update("Research https://example.com"));
  expect(
    t.calls.some(
      (c) => c.method === "editMessageText" && c.body.text === "Researching…",
    ),
  ).toBe(true);
  expect(t.calls.at(-1)?.body.entities).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "text_link",
        url: "https://example.com/research",
      }),
    ]),
  );
  t.setBinary(await imageFixture());
  const image = update("What is this?");
  await adapter.handle({
    ...image,
    message: {
      ...image.message,
      text: undefined,
      caption: "What is this?",
      photo: [{ file_id: "photo", width: 240, height: 160 }],
    },
  });
  expect(t.calls.at(-1)?.body.text).toContain("blue rectangle");
  await adapter.handle(update("/new"));
  t.setBinary(audioFixture());
  const voice = update("");
  await adapter.handle({
    ...voice,
    message: {
      ...voice.message,
      text: undefined,
      voice: { file_id: "voice", duration: 1 },
    },
  });
  expect(t.calls.at(-1)?.body.text).toContain("voice message");
  const a = (
    await pool.query(
      "SELECT kind,transcript FROM attachments WHERE user_id='alice' ORDER BY created_at DESC LIMIT 1",
    )
  ).rows[0];
  expect(a.kind).toBe("audio");
  expect(a.transcript).toBeTruthy();
});
it("ignores groups/bots, explains P1 documents, and pause/resume shares the existing privacy state", async () => {
  const t = transport(),
    adapter = new TelegramAdapter(pool, t.api, "123", "http://localhost:3000");
  const group = update("hello");
  await adapter.handle({
    ...group,
    message: { ...group.message, chat: { id: -10, type: "group" } },
  });
  expect(t.calls).toHaveLength(0);
  const doc = update("");
  await adapter.handle({
    ...doc,
    message: {
      ...doc.message,
      text: undefined,
      document: { file_id: "pdf", mime_type: "application/pdf" },
    },
  });
  expect(t.calls.at(-1)?.body.text).toContain("not supported");
  await adapter.handle(update("/pause"));
  await adapter.handle(update("Hello while paused"));
  expect(t.calls.at(-1)?.body.text).toContain("paused");
  await adapter.handle(update("/resume"));
  expect(
    (
      await pool.query(
        "SELECT processing_paused FROM \"user\" WHERE id='alice'",
      )
    ).rows[0].processing_paused,
  ).toBe(false);
});
it("personal state created through Telegram is the same owned state shown on Web across new conversations", async () => {
  const t = transport(),
    adapter = new TelegramAdapter(pool, t.api, "123", "http://localhost:3000");
  const first = update("I'm thinking about going to Japan in December.");
  await adapter.handle(first);
  await adapter.handle(first);
  const overview = await lifeState(pool, "alice");
  const japan = overview!.records.find(
    (r) => r.recordRole === "object" && r.content === "Japan trip",
  )!;
  expect(japan).toBeTruthy();
  expect(
    overview!.records.filter((r) => r.content === "Japan trip"),
  ).toHaveLength(1);
  await adapter.handle(update("/new"));
  await adapter.handle(
    update("Save this hotel for Japan: https://example.com/kyoto-hotel"),
  );
  const detail = await lifeState(pool, "alice", japan.id);
  expect(detail!.records).toEqual([
    expect.objectContaining({
      parentId: japan.id,
      content: "Kyoto hotel",
      recordRole: "item",
    }),
  ]);
  expect(await lifeState(pool, "bob", japan.id)).toBeNull();
  await adapter.handle(update("/new"));
  await adapter.handle(update("What do I have planned for Japan?"));
  expect(t.calls.at(-1)?.body.text).toContain("Kyoto hotel");
  expect(
    await new PostgresMemory(pool).recall("alice", { query: "Japan" }),
  ).toEqual([]);
});
it("uncertain sends are not repeated, unlink preserves data, and restore revokes old channel access", async () => {
  const failing = new TelegramApi("123:fixture", async () => {
    throw Error("uncertain send");
  });
  const adapter = new TelegramAdapter(
    pool,
    failing,
    "123",
    "http://localhost:3000",
  );
  const u = update("Hello");
  await expect(adapter.handle(u)).rejects.toThrow(/transport/);
  await adapter.handle(u);
  expect((await store.receipt("123", u.update_id)).state).toBe(
    "delivery_unknown",
  );
  await store.disconnect("alice");
  expect(await store.identity("101")).toBeUndefined();
  expect(
    await new PostgresMemory(pool).recall("alice", {
      query: "flight_seat_preference",
    }),
  ).toHaveLength(1);
  await store.link("101", await store.issue("alice"));
  await suppressDeletedData(pool, []);
  expect(await store.identity("101")).toBeUndefined();
  expect((await pool.query("SELECT * FROM telegram_link_codes")).rowCount).toBe(
    0,
  );
});
