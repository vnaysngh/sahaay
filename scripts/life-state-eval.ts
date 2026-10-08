import "./env";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { PostgresConversations } from "../apps/web/src/db/conversations";
import { PostgresSavedItems } from "../apps/web/src/db/items";
import { PostgresMemory } from "../apps/web/src/db/memory";
import { lifeState } from "../apps/web/src/db/life-state";
import { startSahaay, sahaayEvents } from "../apps/web/src/core/runtime";
import { TelegramAdapter } from "../apps/web/src/channels/telegram/adapter";
import { TelegramStore } from "../apps/web/src/channels/telegram/store";
import { TelegramApi } from "../apps/web/src/channels/telegram/api";
// Opt-in live agent evaluation. Invented data only, isolated SQL schema,
// simulated Telegram delivery. No real users/history/media or bot sends.
async function main() {
  if (process.env.SAHAAY_E2E === "1")
    throw Error("Live evaluation requires the real provider");
  const admin = new Pool({ connectionString: process.env.DATABASE_URL });
  const schema = `state_eval_${crypto.randomUUID().replaceAll("-", "")}`;
  const root = await mkdtemp(join(tmpdir(), "sahaay-state-eval-"));
  let pool: Pool | undefined,
    phase = "setup";
  const globals = globalThis as typeof globalThis & { sahaayPool?: Pool };
  const priorPool = globals.sahaayPool,
    priorLedger = process.env.SAHAAY_DELETION_LEDGER_DIR;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      options: `-c search_path=${schema},public`,
    });
    globals.sahaayPool = pool;
    process.env.SAHAAY_DELETION_LEDGER_DIR = root;
    for (const f of (await readdir("apps/web/migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort())
      await pool.query(await readFile(`apps/web/migrations/${f}`, "utf8"));
    const owner = "synthetic-eval";
    await pool.query(
      `INSERT INTO "user"(id,name,email,email_verified) VALUES($1,'Synthetic evaluation','state-eval@example.invalid',true)`,
      [owner],
    );
    const store = new PostgresConversations(pool),
      items = new PostgresSavedItems(pool),
      memories = new PostgresMemory(pool),
      links = new TelegramStore(pool);
    await links.link("101", await links.issue(owner));
    if ((await links.identity("101"))?.user_id !== owner)
      throw Error("synthetic identity unavailable");
    let telegramReply = "",
      seq = 1;
    const api = new TelegramApi("123:synthetic-only", async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.text) telegramReply = body.text;
      return Response.json({ ok: true, result: { message_id: seq++ } });
    });
    const adapter = new TelegramAdapter(
      pool,
      api,
      "123",
      "http://localhost:3000",
    );
    async function telegram(text: string) {
      await adapter.handle({
        update_id: seq++,
        message: {
          message_id: seq++,
          date: Math.floor(Date.now() / 1000),
          from: { id: 101, is_bot: false },
          chat: { id: 101, type: "private" },
          text,
        },
      });
      return telegramReply;
    }
    async function web(text: string, id?: string) {
      const conversationId = id ?? (await store.create(owner)).id;
      const result = await startSahaay(owner, {
        conversationId,
        requestId: crypto.randomUUID(),
        text,
      });
      if (result.duplicate) throw Error("duplicate");
      let answer = "";
      for await (const e of sahaayEvents(result.request)) {
        if (e.type === "error") throw Error(e.code);
        if (e.type === "complete") answer = e.text;
      }
      if (!answer) throw Error("empty");
      return answer;
    }
    const passed = (name: string) =>
      console.log(
        JSON.stringify({ case: name, passed: true, realAgent: true }),
      );
    if (process.argv.includes("--language-only")) {
      phase = "Hindi natural project";
      await web(
        "मैं नवंबर में मिट्टी के बर्तन का प्रोजेक्ट शुरू करने की सोच रही हूँ।",
      );
      const project = (
        await items.find(owner, { query: null, recordRole: "object" })
      )[0];
      if (!project || !/नवंबर|November/i.test(JSON.stringify(project)))
        throw Error("Hindi project missing");
      passed(phase);
      phase = "Hindi cross-conversation state recall";
      const reply = await telegram(
        "मेरे मिट्टी के बर्तन वाले प्रोजेक्ट की क्या योजना है?",
      );
      if (!/नवंबर|November/i.test(reply)) throw Error("Hindi recall missing");
      passed(phase);
      phase = "Hinglish natural idea";
      await web("Mera ek podcast idea hai: small-town founders ki stories.");
      if (
        !(await items.find(owner, { query: null })).some((i) =>
          /founder|stories|फाउंडर/i.test(i.content),
        )
      )
        throw Error("Hinglish idea missing");
      passed(phase);
      return;
    }
    phase = "natural plan from Telegram";
    await telegram("I'm thinking about going to Japan in December.");
    const japan = (
      await items.find(owner, { query: "Japan", recordRole: "object" })
    )[0];
    if (!japan || !JSON.stringify(japan.structuredValue).includes("December"))
      throw Error("missing object");
    passed(phase);
    phase = "cross-channel hotel association";
    await web(
      "Save this hotel for Japan: Kyoto Garden Hotel, https://example.com/kyoto-garden-hotel",
    );
    const children = await items.find(owner, {
      query: null,
      parentId: japan.id,
    });
    if (
      children.length !== 1 ||
      children[0].recordRole !== "item" ||
      (await memories.recall(owner, { query: "Japan" })).length
    )
      throw Error("incorrect relationship");
    if (!(await lifeState(pool, owner, japan.id))?.records.length)
      throw Error("Web state missing");
    passed(phase);
    phase = "cross-conversation plan recall";
    await telegram("/new");
    const answer = await telegram("What do I have planned for Japan?");
    if (
      !/Japan/i.test(answer) ||
      !/December/i.test(answer) ||
      !/Kyoto/i.test(answer)
    )
      throw Error("lost context");
    passed(phase);
    phase = "purchase amount";
    await web("I bought running shoes for ₹9,500.");
    const shoes = (await items.find(owner, { query: "shoes" }))[0];
    if (
      !shoes ||
      shoes.structuredValue?.amount !== 9500 ||
      shoes.structuredValue.currency !== "INR"
    )
      throw Error("amount lost");
    passed(phase);
    phase = "considering item";
    await web("I'm considering buying an M5 MacBook.");
    const considering = await items.find(owner, {
      query: "MacBook",
      stateLabel: "considering",
    });
    if (!considering.length || considering[0].recordRole !== "item")
      throw Error("consideration lost");
    passed(phase);
    phase = "explicit preference separate";
    await web("Remember that I prefer morning flights.");
    if (!(await memories.recall(owner, { query: "flight" })).length)
      throw Error("memory missing");
    passed(phase);
    phase = "quoted declaration must not create state";
    const count = (
      await pool.query(
        "SELECT count(*)::int n FROM saved_items WHERE user_id=$1",
        [owner],
      )
    ).rows[0].n;
    await web(
      'Explain the sentence "I am planning a Mars expedition in February". Do not save it.',
    );
    if (
      (
        await pool.query(
          "SELECT count(*)::int n FROM saved_items WHERE user_id=$1",
          [owner],
        )
      ).rows[0].n !== count
    )
      throw Error("quoted write");
    passed(phase);
    phase = "natural idea without save command";
    await web("Idea for a video: why Indian airlines are always delayed.");
    if (!(await items.find(owner, { query: "airlines" })).length)
      throw Error("idea missing");
    passed(phase);
    phase = "state update";
    await web("Move my Japan trip to January instead of December.");
    const updated = (
      await items.find(owner, { query: "Japan", recordRole: "object" })
    )[0];
    if (
      !updated ||
      updated.version !== 2 ||
      !JSON.stringify(updated.structuredValue).includes("January") ||
      JSON.stringify(updated.structuredValue).includes("December")
    )
      throw Error("update missing");
    passed(phase);
    phase = "unsupported external action category";
    await web("Buy that M5 MacBook for me now.");
    const unsupported = (
      await pool.query(
        "SELECT 1 FROM product_events WHERE user_id=$1 AND 'unsupported_action'=ANY(behaviors) AND unsupported_category='shopping'",
        [owner],
      )
    ).rowCount;
    if (!unsupported) throw Error("event missing");
    passed(phase);
    phase = "object deletion keeps saved item";
    await web(
      "Delete my Japan trip but keep its saved hotel as an ungrouped item.",
    );
    if (
      (await items.find(owner, { query: "Japan", recordRole: "object" }))
        .length ||
      !(await items.find(owner, { query: "Kyoto" })).some(
        (i) => i.parentId === null,
      )
    )
      throw Error("delete failed");
    passed(phase);
  } catch {
    throw Error(
      `Live M6 evaluation failed at ${phase}. Private data and provider responses were not logged.`,
    );
  } finally {
    globals.sahaayPool = priorPool;
    if (priorLedger === undefined)
      delete process.env.SAHAAY_DELETION_LEDGER_DIR;
    else process.env.SAHAAY_DELETION_LEDGER_DIR = priorLedger;
    await pool?.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    await rm(root, { recursive: true, force: true });
  }
}
main().catch((e: Error) => {
  console.error(e.message);
  process.exitCode = 1;
});
