import "../../scripts/env";
import { mkdtemp, rm, access, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Attachments } from "../../apps/web/src/media/attachments";
import { MediaFiles } from "../../apps/web/src/media/files";
import { imageFixture } from "../fixtures";
import { Pool } from "pg";
import { describe, it, beforeAll, afterAll, expect } from "vitest";
import { PostgresConversations } from "../../apps/web/src/db/conversations";
const schema = `test_${crypto.randomUUID().replaceAll("-", "")}`;
let admin: Pool;
let pool: Pool;
let db: PostgresConversations;
beforeAll(async () => {
  if (!process.env.DATABASE_URL)
    throw new Error("DATABASE_URL required for PostgreSQL integration tests");
  admin = new Pool({ connectionString: process.env.DATABASE_URL });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
  });
  await pool.query(
    await readFile("apps/web/migrations/0001_web_chat.sql", "utf8"),
  );
  await pool.query(
    await readFile("apps/web/migrations/0002_attachments.sql", "utf8"),
  );
  await pool.query(
    `INSERT INTO "user" (id,name,email) VALUES ('alice','Alice','alice@test.invalid'),('bob','Bob','bob@test.invalid')`,
  );
  db = new PostgresConversations(pool);
});
afterAll(async () => {
  if (pool) await pool.end();
  if (admin) {
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  }
});
describe("PostgreSQL ownership and request lifecycle", () => {
  it("isolates conversation history and prevents foreign writes even at the FK", async () => {
    const conversation = await db.create("alice");
    expect(await db.list("bob")).not.toContainEqual(
      expect.objectContaining({ id: conversation.id }),
    );
    await expect(db.history("bob", conversation.id)).rejects.toMatchObject({
      status: 404,
    });
    await expect(
      db.begin("bob", {
        conversationId: conversation.id,
        requestId: crypto.randomUUID(),
        text: "private",
      }),
    ).rejects.toMatchObject({ status: 404 });
    await expect(
      pool.query(
        "INSERT INTO messages(conversation_id,user_id,request_id,role,content,status) VALUES($1,'bob',$2,'user','bad','running')",
        [conversation.id, crypto.randomUUID()],
      ),
    ).rejects.toMatchObject({ code: "23503" });
  });
  it("deduplicates simultaneous submissions, rejects payload reuse and serializes turns", async () => {
    const conversation = await db.create("alice");
    const input = {
      conversationId: conversation.id,
      requestId: crypto.randomUUID(),
      text: "My name is Kavya",
    };
    const results = await Promise.all([
      db.begin("alice", input),
      db.begin("alice", input),
    ]);
    expect(results.filter((r) => !r.duplicate)).toHaveLength(1);
    await expect(
      db.begin("alice", { ...input, text: "different" }),
    ).rejects.toMatchObject({ status: 409, code: "request_conflict" });
    await expect(
      db.begin("alice", { ...input, requestId: crypto.randomUUID() }),
    ).rejects.toMatchObject({ status: 409, code: "busy" });
    const run = results.find((r) => !r.duplicate)!;
    if (run.duplicate) throw new Error("missing new request");
    const answer = await db.complete(run.request, "Hello Kavya");
    expect(answer).toBeTruthy();
    expect(await db.complete(run.request, "duplicate")).toBeNull();
    const second = await db.begin("alice", {
      ...input,
      requestId: crypto.randomUUID(),
      text: "What name did I tell you?",
    });
    if (second.duplicate) throw new Error("unexpected duplicate");
    expect(
      await db.context("alice", conversation.id, second.request.messageId),
    ).toEqual([
      { role: "user", content: input.text },
      { role: "assistant", content: "Hello Kavya" },
      { role: "user", content: "What name did I tell you?" },
    ]);
    await db.fail(second.request, "provider_failed");
  });
  it("reconciles abandoned requests and rejects a late completion", async () => {
    const conversation = await db.create("bob");
    const first = await db.begin("bob", {
      conversationId: conversation.id,
      requestId: crypto.randomUUID(),
      text: "first",
    });
    if (first.duplicate) throw new Error("unexpected");
    await pool.query(
      "UPDATE messages SET created_at=now()-interval '211 seconds' WHERE id=$1",
      [first.request.messageId],
    );
    const next = await db.begin("bob", {
      conversationId: conversation.id,
      requestId: crypto.randomUUID(),
      text: "next",
    });
    expect(next.duplicate).toBe(false);
    expect(await db.complete(first.request, "late")).toBeNull();
    expect((await db.history("bob", conversation.id))[0].status).toBe(
      "interrupted",
    );
  });
  it("expires content and titles and bounds context", async () => {
    const conversation = await db.create("alice");
    const first = await db.begin("alice", {
      conversationId: conversation.id,
      requestId: crypto.randomUUID(),
      text: "expired sensitive title",
    });
    if (first.duplicate) throw new Error("unexpected");
    await pool.query(
      "UPDATE messages SET created_at=now()-interval '8 days' WHERE conversation_id=$1",
      [conversation.id],
    );
    await pool.query(
      "UPDATE conversations SET created_at=now()-interval '8 days' WHERE id=$1",
      [conversation.id],
    );
    await db.cleanup();
    await expect(db.history("alice", conversation.id)).rejects.toMatchObject({
      status: 404,
    });
  });
  it("enforces the hourly limit across conversations without accepting another request", async () => {
    await pool.query(
      `INSERT INTO "user" (id,name,email) VALUES ('limited','Limited','limited@test.invalid')`,
    );
    const conversation = await db.create("limited");
    await pool.query(
      `INSERT INTO messages(conversation_id,user_id,request_id,role,content,status)
      SELECT $1,'limited',gen_random_uuid(),'user','test','failed' FROM generate_series(1,30)`,
      [conversation.id],
    );
    const other = await db.create("limited");
    await expect(
      db.begin("limited", {
        conversationId: other.id,
        requestId: crypto.randomUUID(),
        text: "over limit",
      }),
    ).rejects.toMatchObject({ status: 429, code: "quota" });
    expect(await db.history("limited", other.id)).toHaveLength(0);
  });
  it("claims owned uploads once, hides foreign files and denies expired content", async () => {
    const root = await mkdtemp(join(tmpdir(), "sahaay-owned-media-"));
    const files = new MediaFiles(root);
    const media = new Attachments(pool, files);
    try {
      const image = await media.upload("bob", await imageFixture(), "test.png");
      await expect(media.read("alice", image.id)).rejects.toMatchObject({
        status: 404,
      });
      await expect(media.remove("alice", image.id)).rejects.toMatchObject({
        status: 404,
      });
      const conversation = await db.create("bob");
      const input = {
        conversationId: conversation.id,
        requestId: crypto.randomUUID(),
        text: "What is this?",
        attachmentIds: [image.id],
      };
      await expect(
        db.begin("alice", {
          ...input,
          conversationId: (await db.create("alice")).id,
        }),
      ).rejects.toMatchObject({ status: 404 });
      const run = await db.begin("bob", input);
      if (run.duplicate) throw new Error("unexpected duplicate");
      expect(
        (await db.context("bob", conversation.id, run.request.messageId))[0]
          .attachments?.[0].id,
      ).toBe(image.id);
      expect(
        (await db.history("bob", conversation.id))[0].attachments?.[0]
          .available,
      ).toBe(true);
      expect((await db.begin("bob", input)).duplicate).toBe(true);
      await expect(
        db.begin("bob", { ...input, attachmentIds: [] }),
      ).rejects.toMatchObject({ status: 409 });
      await media.saveTranscript("alice", image.id, {
        text: "not allowed",
        metadata: {
          provider: "test",
          model: "test",
          detectedLanguage: null,
          languageProbability: null,
          codeSwitching: null,
        },
      });
      expect((await media.get("bob", image.id)).transcript).toBeNull();
      await pool.query(
        "UPDATE attachments SET expires_at=now()-interval '1 second' WHERE id=$1",
        [image.id],
      );
      await expect(media.read("bob", image.id)).rejects.toMatchObject({
        status: 410,
      });
      await media.cleanup();
      await expect(access(files.path(image.id))).rejects.toThrow();
      expect(
        (await db.history("bob", conversation.id))[0].attachments?.[0]
          .available,
      ).toBe(false);
      await db.fail(run.request, "test_done");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
