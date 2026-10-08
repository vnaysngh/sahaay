import "./env";
import { readFile, readdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Pool } from "pg";
import { PostgresConversations } from "../apps/web/src/db/conversations";
import { PostgresFollowups } from "../apps/web/src/db/followups";
import { startSahaay, sahaayEvents } from "../apps/web/src/core/runtime";
import { TelegramAdapter } from "../apps/web/src/channels/telegram/adapter";
import { TelegramApi } from "../apps/web/src/channels/telegram/api";
import { localDate } from "../apps/web/src/core/followups";
// Live provider, isolated invented accounts, fake Telegram delivery. Never real
// user data, real bot notifications, research searches or production mutations.
async function main() {
  if (process.env.SAHAAY_E2E === "1") throw Error("Live provider required");
  const admin = new Pool({ connectionString: process.env.DATABASE_URL }),
    schema = `followup_eval_${crypto.randomUUID().replaceAll("-", "")}`,
    root = await mkdtemp(join(tmpdir(), "sahaay-fu-eval-"));
  const globals = globalThis as typeof globalThis & { sahaayPool?: Pool },
    prior = globals.sahaayPool,
    ledger = process.env.SAHAAY_DELETION_LEDGER_DIR;
  let pool: Pool | undefined,
    phase = "setup";
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
    await pool.query(
      `INSERT INTO "user"(id,name,email,email_verified,timezone) VALUES('eval','Synthetic','fu-eval@example.invalid',true,'Asia/Kolkata'),('unknown','Synthetic unknown','fu-unknown@example.invalid',true,NULL)`,
    );
    await pool.query(
      `INSERT INTO telegram_links(telegram_user_id,user_id) VALUES('101','eval')`,
    );
    let seq = 1,
      reply = "";
    const api = new TelegramApi("123:synthetic", async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      if (body.text) reply = body.text;
      return Response.json({ ok: true, result: { message_id: seq++ } });
    });
    const adapter = new TelegramAdapter(
        pool,
        api,
        "123",
        "http://localhost:3000",
      ),
      followups = new PostgresFollowups(pool),
      chat = new PostgresConversations(pool);
    async function tg(text: string) {
      reply = "";
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
      if (!reply) throw Error("missing reply");
    }
    async function web(text: string, owner = "eval") {
      const c = await chat.create(owner),
        r = await startSahaay(owner, {
          conversationId: c.id,
          requestId: crypto.randomUUID(),
          text,
        });
      if (r.duplicate) throw Error("duplicate");
      let answer = "";
      for await (const e of sahaayEvents(r.request)) {
        if (e.type === "error") throw Error(e.code);
        if (e.type === "complete") answer = e.text;
      }
      return answer;
    }
    function check(pass: boolean) {
      if (!pass) throw Error("assertion failed");
      console.log(`PASS ${phase}`);
    }
    phase = "incidental dated state creates no follow-up";
    await tg("I'm planning a Japan trip in December.");
    check((await followups.list("eval")).length === 0);
    phase = "explicit Telegram reminder attaches to Japan";
    await tg("Remind me tomorrow at 10 AM to research flights for Japan.");
    let rows = await followups.list("eval");
    check(
      rows.length === 1 &&
        rows[0].relatedTitle?.toLowerCase().includes("japan") === true &&
        localDate(new Date(rows[0].scheduledFor), "Asia/Kolkata").endsWith(
          "T10:00",
        ),
    );
    const id = rows[0].id;
    phase = "natural correction keeps one reminder";
    await tg("Actually make that noon.");
    rows = await followups.list("eval");
    check(
      rows.length === 1 &&
        rows[0].id === id &&
        rows[0].version === 2 &&
        localDate(new Date(rows[0].scheduledFor), "Asia/Kolkata").endsWith(
          "T12:00",
        ),
    );
    phase = "Web object recall includes follow-up";
    const recalled = await web(
      "What do I have planned for Japan, including follow-ups?",
    );
    check(/remind|follow.up|noon|12:00/i.test(recalled));
    phase = "reminder query and explicit refusal do not cancel";
    await tg(
      "Will you still remind me about Japan? Do not cancel or change it.",
    );
    check(
      (await followups.list("eval"))[0].status === "scheduled" &&
        (await followups.list("eval"))[0].version === 2,
    );
    phase = "natural cancellation closes reminder";
    await tg("Cancel that reminder.");
    check((await followups.list("eval"))[0].status === "cancelled");
    phase = "monitoring records demand without scheduling";
    await tg("Can you monitor the price of this flight every day?");
    check(
      (
        await pool.query(
          "SELECT 1 FROM product_events WHERE user_id='eval' AND unsupported_capability='flight_price_monitoring' AND channel='telegram'",
        )
      ).rowCount === 1 && (await followups.list("eval")).length === 1,
    );
    phase = "unknown timezone asks instead of scheduling";
    await web("Remind me tomorrow at 10 AM to check my packing.", "unknown");
    check((await followups.list("unknown")).length === 0);
    phase = "quoted reminder cannot authorize a schedule";
    await web(
      'Translate this example into Hindi: "Remind me tomorrow at 10 AM to check packing."',
    );
    check((await followups.list("eval")).length === 1);
    phase = "Hindi explicit reminder in same core";
    await tg(
      "कल सुबह 10 बजे जापान यात्रा के लिए फ्लाइट्स देखने की याद दिलाना।",
    );
    check(
      (await followups.list("eval")).filter((r) => r.status === "scheduled")
        .length === 1,
    );
    console.log(
      "M7 live evaluation complete: ten synthetic cases; fake Telegram sends only.",
    );
  } catch {
    console.error(`M7 live evaluation failed: ${phase}`);
    process.exitCode = 1;
  } finally {
    globals.sahaayPool = prior;
    if (ledger === undefined) delete process.env.SAHAAY_DELETION_LEDGER_DIR;
    else process.env.SAHAAY_DELETION_LEDGER_DIR = ledger;
    await pool?.end();
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
    await rm(root, { recursive: true, force: true });
  }
}
main().catch(() => {
  console.error("Live follow-up evaluation setup failed");
  process.exitCode = 1;
});
