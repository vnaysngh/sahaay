import "../../scripts/env";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { PostgresFollowups } from "../../apps/web/src/db/followups";
import {
  FollowupWorker,
  type FollowupNotifier,
} from "../../apps/web/src/core/followup-worker";
import { PostgresConversations } from "../../apps/web/src/db/conversations";
import { PostgresSavedItems } from "../../apps/web/src/db/items";
import { TelegramApi } from "../../apps/web/src/channels/telegram/api";
import { TelegramAdapter } from "../../apps/web/src/channels/telegram/adapter";
import { telegramFollowupNotifier } from "../../apps/web/src/channels/telegram/followups";
import { startSahaay, sahaayEvents } from "../../apps/web/src/core/runtime";
import { localDate, resolveLocalTime } from "../../apps/web/src/core/followups";
import type { MutationContext } from "../../apps/web/src/core/memory";
import { suppressDeletedData } from "../../apps/web/src/privacy/restore";
import { DeletionJournal } from "../../apps/web/src/privacy/journal";
const schema = `followups_${crypto.randomUUID().replaceAll("-", "")}`;
let pool: Pool,
  admin: Pool,
  root: string,
  store: PostgresFollowups,
  chat: PostgresConversations;
const globals = globalThis as typeof globalThis & { sahaayPool?: Pool };
let previousPool: Pool | undefined;
const envKeys = [
  "SAHAAY_E2E",
  "SAHAAY_DELETION_LEDGER_DIR",
  "SAHAAY_MEDIA_DIR",
] as const;
const previous = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), "sahaay-followups-"));
  process.env.SAHAAY_E2E = "1";
  process.env.SAHAAY_DELETION_LEDGER_DIR = join(root, "journal");
  process.env.SAHAAY_MEDIA_DIR = join(root, "media");
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
    `INSERT INTO "user"(id,name,email,email_verified,timezone) VALUES('alice','Alice','fu-alice@example.invalid',true,'Asia/Kolkata'),('bob','Bob','fu-bob@example.invalid',true,NULL)`,
  );
  store = new PostgresFollowups(pool);
  chat = new PostgresConversations(pool);
  previousPool = globals.sahaayPool;
  globals.sahaayPool = pool;
});
beforeEach(async () => {
  await pool.query("DELETE FROM followups");
  await pool.query("DELETE FROM saved_items");
  await pool.query("DELETE FROM conversations");
  await pool.query("DELETE FROM record_mutations");
  await pool.query("DELETE FROM product_events");
  await pool.query("DELETE FROM telegram_links");
  await pool.query(
    `UPDATE "user" SET processing_paused=false,email_verified=true,timezone=CASE WHEN id='alice' THEN 'Asia/Kolkata' ELSE NULL END`,
  );
});
afterAll(async () => {
  globals.sahaayPool = previousPool;
  for (const k of envKeys) {
    if (previous[k] === undefined) delete process.env[k];
    else process.env[k] = previous[k];
  }
  await pool?.end();
  await admin?.query(`DROP SCHEMA "${schema}" CASCADE`);
  await admin?.end();
  await rm(root, { recursive: true, force: true });
});
async function ctx(
  text = "Remind me tomorrow at 10 AM",
  owner = "alice",
): Promise<MutationContext> {
  const c = await chat.create(owner);
  const r = await chat.begin(owner, {
    conversationId: c.id,
    requestId: crypto.randomUUID(),
    text,
  });
  if (r.duplicate) throw Error("duplicate");
  return {
    request: r.request,
    actionId: crypto.randomUUID(),
    reviewItemIntent: async () => true,
  };
}
function input(relatedItemId: string | null = null, hour = "10:00") {
  const timezone = "Asia/Kolkata",
    localTime =
      localDate(new Date(Date.now() + 86400000), timezone).slice(0, 10) +
      "T" +
      hour;
  return {
    reason: "Research flights for Japan",
    relatedItemId,
    timezone,
    localTime,
    scheduledFor: resolveLocalTime(localTime, timezone),
  };
}
async function add() {
  return (await store.create(await ctx(), input())).record!;
}
async function link() {
  await pool.query(
    `INSERT INTO telegram_links(telegram_user_id,user_id) VALUES('101','alice') ON CONFLICT DO NOTHING`,
  );
}
function notifier() {
  const sent: Array<{ id: number; text: string }> = [];
  const send: FollowupNotifier = async (id, text) => {
    sent.push({ id, text });
    return { status: "delivered", messageId: sent.length };
  };
  return { sent, send };
}
let updateId = 1;
function update(text: string) {
  const id = updateId++;
  return {
    update_id: id,
    message: {
      message_id: id,
      date: Math.floor(Date.now() / 1000),
      from: { id: 101, is_bot: false },
      chat: { id: 101, type: "private" },
      text,
    },
  };
}
function fakeApi() {
  return new TelegramApi("123:synthetic", async () =>
    Response.json({ ok: true, result: { message_id: updateId++ } }),
  );
}
it("Flow A/B: Telegram creates one canonical follow-up; Web lists it; correction updates, due delivery recorded once", async () => {
  await link();
  const adapter = new TelegramAdapter(pool, fakeApi(), "123", "test_bot");
  await adapter.handle(
    update("I'm thinking about going to Japan in December."),
  );
  await adapter.handle(
    update("Remind me tomorrow at 10 AM to research flights for Japan."),
  );
  let rows = await store.list("alice");
  expect(rows).toHaveLength(1);
  expect(rows[0].relatedTitle).toBe("Japan trip");
  expect((await store.context("alice")).recent[0].id).toBe(rows[0].id);
  const before = rows[0];
  await adapter.handle(update("Actually make that noon."));
  rows = await store.list("alice");
  expect(rows).toHaveLength(1);
  expect(rows[0].id).toBe(before.id);
  expect(rows[0].version).toBe(2);
  expect(localDate(new Date(rows[0].scheduledFor), "Asia/Kolkata")).toContain(
    "T12:00",
  );
  const n = notifier(),
    worker = new FollowupWorker(pool, n.send);
  await worker.tick(new Date(before.scheduledFor));
  expect(n.sent).toHaveLength(0);
  await worker.tick(new Date(rows[0].scheduledFor));
  await worker.tick(new Date(rows[0].scheduledFor));
  expect(n.sent).toHaveLength(1);
  expect(n.sent[0].text).toContain("Japan trip");
  expect((await store.list("alice"))[0]).toMatchObject({
    status: "ready",
    deliveryStatus: "delivered",
  });
});
it("Flow C: Telegram cancellation prevents delivery and does not create another reminder", async () => {
  await link();
  const adapter = new TelegramAdapter(pool, fakeApi(), "123", "test_bot");
  await adapter.handle(
    update("Remind me tomorrow at 10 AM to research flights for Japan."),
  );
  const r = (await store.list("alice"))[0];
  await adapter.handle(update("Cancel that reminder."));
  const n = notifier();
  await new FollowupWorker(pool, n.send).tick(new Date(r.scheduledFor));
  expect(n.sent).toHaveLength(0);
  expect((await store.list("alice"))[0].status).toBe("cancelled");
});
it("Flow D: Web chat creates, Web opens/reschedules/dismisses, shared core sees no active reminder", async () => {
  const c = await chat.create("alice");
  const r = await startSahaay("alice", {
    conversationId: c.id,
    requestId: crypto.randomUUID(),
    text: "Remind me tomorrow at 10 AM to research flights for Japan.",
    channel: "web",
  });
  if (r.duplicate) throw Error("duplicate");
  for await (const e of sahaayEvents(r.request)) {
    expect(e.type).not.toBe("error");
  }
  let f = (await store.list("alice"))[0];
  f = await store.webChange("alice", f.id, f.version, "open");
  expect(f.openedAt).toBeTruthy();
  f = await store.webChange(
    "alice",
    f.id,
    f.version,
    "reschedule",
    input(null, "12:00"),
  );
  f = await store.webChange(
    "alice",
    f.id,
    f.version,
    "dismiss",
    undefined,
    true,
  );
  expect(f.status).toBe("dismissed");
  await link();
  const n = notifier();
  await new FollowupWorker(pool, n.send).tick(new Date(f.scheduledFor));
  expect(n.sent).toHaveLength(0);
  const events = JSON.stringify(
    (await pool.query("SELECT * FROM product_events")).rows,
  );
  expect(events).toContain("followup_dismissed");
  expect(events).not.toContain("Japan");
});
it("Flow E: monitoring demand records only normalized category/capability/channel and creates no monitor", async () => {
  await link();
  await new TelegramAdapter(pool, fakeApi(), "123", "test_bot").handle(
    update("Can you monitor the price of this flight every day?"),
  );
  expect(await store.list("alice")).toEqual([]);
  const row = (
    await pool.query(
      "SELECT * FROM product_events WHERE unsupported_capability='flight_price_monitoring'",
    )
  ).rows[0];
  expect(row).toMatchObject({
    unsupported_category: "travel",
    channel: "telegram",
  });
  expect(JSON.stringify(row)).not.toContain("every day");
});
it("Flow F: a fresh worker catches up after restart and concurrent workers send once", async () => {
  const r = await add();
  await link();
  const n = notifier();
  await new FollowupWorker(pool, n.send).tick();
  expect(n.sent).toHaveLength(0);
  await Promise.all([
    new FollowupWorker(pool, n.send).tick(new Date(r.scheduledFor)),
    new FollowupWorker(pool, n.send).tick(new Date(r.scheduledFor)),
  ]);
  await new FollowupWorker(pool, n.send).tick(new Date(r.scheduledFor));
  expect(n.sent).toHaveLength(1);
});
it("unknown sends and crash leftovers never auto-retry; explicitly rescheduling starts a new version", async () => {
  let r = await add();
  await link();
  let calls = 0;
  const sender: FollowupNotifier = async () => {
    calls++;
    return { status: "unknown" };
  };
  await new FollowupWorker(pool, sender).tick(new Date(r.scheduledFor));
  await new FollowupWorker(pool, sender).tick(new Date(r.scheduledFor));
  expect(calls).toBe(1);
  r = await store.webChange(
    "alice",
    r.id,
    r.version,
    "reschedule",
    input(null, "12:00"),
  );
  await pool.query(
    "UPDATE followups SET status='ready',delivery_status='sending',attempt_id=gen_random_uuid(),updated_at=now()-interval '4 minutes' WHERE id=$1",
    [r.id],
  );
  await new FollowupWorker(pool, sender).tick(new Date(r.scheduledFor));
  expect(calls).toBe(1);
  expect((await store.list("alice"))[0].deliveryStatus).toBe("unknown");
});
it("known 429 rejection retries with backoff and stops after a bounded budget", async () => {
  const r = await add();
  await link();
  let calls = 0;
  const sender: FollowupNotifier = async () => {
    calls++;
    return { status: "retry", after: 60 };
  };
  const worker = new FollowupWorker(pool, sender),
    due = new Date(r.scheduledFor);
  await worker.tick(due);
  await worker.tick(due);
  expect(calls).toBe(1);
  await worker.tick(new Date(+due + 60000));
  await worker.tick(new Date(+due + 120000));
  await worker.tick(new Date(+due + 180000));
  expect(calls).toBe(3);
  expect((await store.list("alice"))[0].deliveryStatus).toBe("failed");
});
it("unlinked accounts still have a durable Inbox; pause/verification/unlink prevent sends", async () => {
  const r = await add(),
    n = notifier(),
    worker = new FollowupWorker(pool, n.send, true),
    due = new Date(r.scheduledFor);
  await worker.tick(due);
  expect((await store.list("alice"))[0].status).toBe("ready");
  expect(n.sent).toHaveLength(0);
  await link();
  await pool.query(`UPDATE "user" SET processing_paused=true WHERE id='alice'`);
  await worker.tick(due);
  expect(n.sent).toHaveLength(0);
  await pool.query(
    `UPDATE "user" SET processing_paused=false,email_verified=false WHERE id='alice'`,
  );
  await worker.tick(due);
  expect(n.sent).toHaveLength(0);
  await pool.query(`UPDATE "user" SET email_verified=true WHERE id='alice'`);
  await worker.tick(due);
  expect(n.sent).toHaveLength(1);
});
it("owned versions, intent denial, expired-source replay and missing timezone are explicit", async () => {
  const c = await ctx();
  const r = (await store.create(c, input())).record!;
  expect((await store.create(c, input())).outcome).toBe("replayed");
  await expect(
    store.webChange("bob", r.id, r.version, "done"),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    store.webChange("alice", r.id, 99, "done"),
  ).rejects.toMatchObject({ status: 409 });
  const denied = await ctx();
  denied.reviewItemIntent = async () => false;
  await expect(store.create(denied, input())).rejects.toMatchObject({
    status: 403,
  });
  delete denied.reviewItemIntent;
  await expect(store.create(denied, input())).rejects.toMatchObject({
    status: 403,
  });
  await pool.query("DELETE FROM conversations");
  expect((await store.create(c, input())).outcome).toBe("replayed");
  expect((await store.context("bob")).timezone).toBeNull();
  await expect(store.configureTimezone("bob", "invalid")).rejects.toMatchObject(
    { status: 400 },
  );
});
it("state deletion cancels parent and child reminders; restored backups never replay notifications", async () => {
  const items = new PostgresSavedItems(pool),
    plan = (
      await items.save(await ctx("I am planning Japan"), {
        recordRole: "object",
        parentId: null,
        stateLabel: "planning",
        kind: "trip",
        content: "Japan",
        url: null,
        structuredValue: null,
        listLabel: null,
        status: "saved",
      })
    ).record!;
  const child = (
    await items.save(await ctx("Save this hotel"), {
      recordRole: "item",
      parentId: plan.id,
      kind: "hotel",
      content: "Kyoto",
      url: null,
      structuredValue: null,
      listLabel: null,
      status: "saved",
    })
  ).record!;
  await store.create(await ctx(), input(plan.id));
  await store.create(await ctx(), input(child.id));
  await link();
  await items.remove(await ctx("Delete Japan"), plan.id, plan.version);
  expect((await store.list("alice")).map((r) => r.status)).toEqual([
    "cancelled",
    "cancelled",
  ]);
  await add();
  await suppressDeletedData(
    pool,
    await new DeletionJournal(join(root, "journal")).entries(),
  );
  expect(
    (await store.list("alice")).every((r) => r.status === "cancelled"),
  ).toBe(true);
  expect((await pool.query("SELECT 1 FROM telegram_links")).rowCount).toBe(0);
});
it("transport treats malformed success/network failures as uncertain and 429 as safe rejection", async () => {
  const malformed = telegramFollowupNotifier(
    new TelegramApi("123:test", async () =>
      Response.json({ ok: true, result: {} }),
    ),
  );
  expect(await malformed(101, "synthetic")).toEqual({ status: "unknown" });
  const rejected = telegramFollowupNotifier(
    new TelegramApi("123:test", async () =>
      Response.json(
        { ok: false, error_code: 429, parameters: { retry_after: 50 } },
        { status: 429 },
      ),
    ),
  );
  expect(await rejected(101, "synthetic")).toEqual({
    status: "retry",
    after: 50,
  });
});
it("opening is observational and keeps the delivery version; cancellation waits for an already-started send", async () => {
  let r = await add();
  const version = r.version;
  r = await store.webChange("alice", r.id, version, "open");
  expect(r.version).toBe(version);
  await link();
  let start!: () => void, finish!: () => void;
  const started = new Promise<void>((resolve) => {
      start = resolve;
    }),
    finished = new Promise<void>((resolve) => {
      finish = resolve;
    });
  let sends = 0;
  const sender: FollowupNotifier = async () => {
    sends++;
    start();
    await finished;
    return { status: "delivered", messageId: 1 };
  };
  const worker = new FollowupWorker(pool, sender),
    tick = worker.tick(new Date(r.scheduledFor));
  await started;
  const cancelled = store.webChange(
    "alice",
    r.id,
    r.version,
    "cancel",
    undefined,
    true,
  );
  finish();
  await tick;
  expect((await cancelled).status).toBe("cancelled");
  await worker.tick(new Date(r.scheduledFor));
  expect(sends).toBe(1);
});
it("failed delivery stays in Inbox, closed retention and account cascade leave no jobs", async () => {
  const r = await add();
  await link();
  const n = notifier();
  await new FollowupWorker(pool, async () => ({ status: "failed" })).tick(
    new Date(r.scheduledFor),
  );
  expect((await store.list("alice"))[0]).toMatchObject({
    status: "ready",
    deliveryStatus: "failed",
  });
  await store.webChange("alice", r.id, r.version, "done");
  await pool.query(
    "UPDATE followups SET updated_at=now()-interval '31 days' WHERE id=$1",
    [r.id],
  );
  await new FollowupWorker(pool, n.send).tick();
  expect(await store.list("alice")).toEqual([]);
  const c = await ctx("Remind me tomorrow in Asia/Kolkata", "bob");
  await store.create(c, input());
  await pool.query(`DELETE FROM "user" WHERE id='bob'`);
  expect(await store.list("bob")).toEqual([]);
});

it("Inbox reads/open and unconfirmed stop actions cannot cancel reminders", async () => {
  const r = await add();
  expect(r.lifecycleSource).toBe("chat_web");
  await store.context("alice");
  await store.list("alice");
  await store.webChange("alice", r.id, r.version, "open");
  for (const action of ["cancel", "dismiss"] as const) {
    await expect(
      store.webChange("alice", r.id, r.version, action),
    ).rejects.toMatchObject({ code: "confirmation_required" });
  }
  expect((await store.list("alice"))[0]).toMatchObject({
    status: "scheduled",
    version: r.version,
    lifecycleSource: "chat_web",
  });
  const stopped = await store.webChange(
    "alice",
    r.id,
    r.version,
    "cancel",
    undefined,
    true,
  );
  expect(stopped).toMatchObject({
    status: "cancelled",
    lifecycleSource: "web_inbox",
  });
  expect(stopped.lifecycleChangedAt).toBeTruthy();
  const n = notifier();
  await link();
  await new FollowupWorker(pool, n.send).tick(new Date(r.scheduledFor));
  expect(n.sent).toHaveLength(0);
});
it("agent cancellation fails closed without current reviewed cancellation intent", async () => {
  const r = await add(),
    request = await ctx("What reminders do I have?");
  request.reviewItemIntent = async () => false;
  await expect(
    store.change(request, r.id, r.version, "cancel"),
  ).rejects.toMatchObject({ status: 403 });
  delete request.reviewItemIntent;
  await expect(
    store.change(request, r.id, r.version, "cancel"),
  ).rejects.toMatchObject({ status: 403 });
  expect((await store.list("alice"))[0]).toMatchObject({
    status: "scheduled",
    version: r.version,
  });
});
