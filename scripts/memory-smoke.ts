import "./env";
import { chromium } from "@playwright/test";
import { Pool } from "pg";
import { randomBytes } from "node:crypto";
async function main() {
  const origin = "http://localhost:3000",
    browser = await chromium.launch(),
    context = await browser.newContext({ baseURL: origin });
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let owner: string | undefined;
  let phase = "auth";
  try {
    const signup = await context.request.post("/api/auth/sign-up/email", {
      headers: { origin },
      data: {
        name: "Synthetic preview",
        email: `memory-${randomBytes(8).toString("hex")}@example.invalid`,
        password: randomBytes(24).toString("hex"),
      },
    });
    if (!signup.ok()) throw Error("auth");
    owner = (await signup.json()).user.id;
    async function conversation() {
      const r = await context.request.post("/api/conversations", {
        headers: { origin },
      });
      if (!r.ok()) throw Error("conversation");
      return (await r.json()).id as string;
    }
    async function send(id: string, text: string) {
      const r = await context.request.post("/api/chat", {
        headers: { origin },
        data: {
          conversationId: id,
          requestId: crypto.randomUUID(),
          text,
          attachmentIds: [],
        },
        timeout: 195000,
      });
      if (!r.ok()) throw Error("chat");
      const events = (await r.text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      const complete = events.find((e) => e.type === "complete");
      if (!complete) {
        console.log(
          JSON.stringify({
            phase,
            events: events.filter((e) => e.type === "error"),
          }),
        );
        throw Error("response");
      }
      return complete.text as string;
    }
    if (process.argv.includes("--composition")) {
      phase = "save plus public research";
      const a = await conversation();
      const answer = await send(
        a,
        "Save this research topic to my research list: why do zebras have stripes? Then research it briefly with sources.",
      );
      const saved = (
        await pool.query("SELECT id FROM saved_items WHERE user_id=$1", [owner])
      ).rowCount;
      const sources = (
        await pool.query(
          "SELECT id FROM research_sources WHERE user_id=$1 AND kind='cited'",
          [owner],
        )
      ).rowCount;
      const memories = (
        await pool.query("SELECT id FROM memories WHERE user_id=$1", [owner])
      ).rowCount;
      if (saved !== 1 || !sources || memories || !/saved/i.test(answer))
        throw Error("composition");
      console.log(
        JSON.stringify({
          passed: true,
          realAgent: true,
          savePlusResearch: true,
          separateSavedItems: true,
          actualCitations: true,
        }),
      );
      return;
    }
    if (process.argv.includes("--hindi")) {
      phase = "Hindi remember";
      const a = await conversation();
      await send(a, "याद रखना, मुझे हवाई जहाज़ में खिड़की वाली सीट पसंद है।");
      if (
        (await pool.query("SELECT id FROM memories WHERE user_id=$1", [owner]))
          .rowCount !== 1
      )
        throw Error("Hindi remember");
      phase = "Hindi cross-conversation recall";
      const b = await conversation();
      const answer = await send(b, "हवाई जहाज़ में मुझे कौन सी सीट पसंद है?");
      if (
        !/खिड़की|विंडो|window/i.test(answer) ||
        !/[\u0900-\u097f]/.test(answer)
      ) {
        throw Error("Hindi recall");
      }
      phase = "Hindi correction";
      await send(b, "असल में मुझे हवाई जहाज़ में गलियारे वाली सीट पसंद है।");
      const updated = (
        await pool.query(
          "SELECT version,content FROM memories WHERE user_id=$1 AND valid_until IS NULL",
          [owner],
        )
      ).rows;
      if (
        updated.length !== 1 ||
        updated[0].version !== 2 ||
        !/गलियारे|aisle/i.test(updated[0].content)
      ) {
        throw Error("Hindi correction");
      }
      phase = "Hindi forget";
      await send(b, "मेरी हवाई जहाज़ वाली सीट की पसंद भूल जाओ।");
      if (
        (await pool.query("SELECT id FROM memories WHERE user_id=$1", [owner]))
          .rowCount
      )
        throw Error("Hindi forget");
      console.log(
        JSON.stringify({
          passed: true,
          realAgent: true,
          hindiRememberRecallCorrectionForget: true,
        }),
      );
      return;
    }
    const a = await conversation();
    phase = "remember";
    await send(a, "Remember I prefer aisle seats on flights.");
    const initial = (
      await pool.query(
        "SELECT id,memory_key,version,content FROM memories WHERE user_id=$1 AND valid_until IS NULL",
        [owner],
      )
    ).rows;
    if (initial.length !== 1 || !/aisle/i.test(initial[0].content))
      throw Error("remember");
    const b = await conversation();
    phase = "cross-conversation recall";
    const recall = await send(b, "What is my preferred flight seat?");
    if (!/aisle/i.test(recall)) {
      throw Error("recall");
    }
    phase = "correction";
    await send(b, "Actually I prefer window seats on flights.");
    const updated = (
      await pool.query(
        "SELECT id,version,content FROM memories WHERE user_id=$1 AND valid_until IS NULL",
        [owner],
      )
    ).rows;
    if (
      updated.length !== 1 ||
      updated[0].version !== 2 ||
      !/window/i.test(updated[0].content)
    ) {
      throw Error("correction");
    }
    phase = "provenance";
    const provenance = await send(
      b,
      "Why do you remember that flight seat preference? When did I tell you?",
    );
    if (!/told|said|explicit|remember|updated|corrected/i.test(provenance))
      throw Error("provenance");
    phase = "forget";
    await send(b, "Forget my flight seat preference.");
    if (
      (await pool.query("SELECT id FROM memories WHERE user_id=$1", [owner]))
        .rowCount
    )
      throw Error("physical delete");
    phase = "recall after deletion";
    const c = await conversation();
    const forgotten = await send(c, "What flight seat do I prefer?");
    if (/you prefer (?:an? )?(?:aisle|window)/i.test(forgotten))
      throw Error("resurrection");
    phase = "save separate idea";
    await send(
      c,
      "Save this video idea to my videos list: a quiet city walk at dawn.",
    );
    const saved = (
      await pool.query(
        "SELECT id FROM saved_items WHERE user_id=$1 AND list_label='videos'",
        [owner],
      )
    ).rows;
    if (saved.length !== 1) {
      throw Error("save");
    }
    if (
      (await pool.query("SELECT id FROM memories WHERE user_id=$1", [owner]))
        .rowCount
    )
      throw Error("semantics");
    phase = "saved item recall";
    const d = await conversation();
    const ideas = await send(d, "Show my saved video ideas.");
    if (!/city walk|dawn/i.test(ideas)) {
      throw Error("item recall");
    }
    phase = "mark done";
    await send(d, "Mark the city walk video idea done.");
    if (
      (
        await pool.query("SELECT status FROM saved_items WHERE user_id=$1", [
          owner,
        ])
      ).rows[0]?.status !== "done"
    )
      throw Error("status");
    phase = "remove idea";
    await send(d, "Delete the saved city walk video idea.");
    if (
      (await pool.query("SELECT id FROM saved_items WHERE user_id=$1", [owner]))
        .rowCount
    )
      throw Error("remove");
    console.log(
      JSON.stringify({
        passed: true,
        realAgent: true,
        crossConversationRecall: true,
        atomicCorrection: true,
        physicalForget: true,
        provenance: true,
        separateSavedItems: true,
        itemStatusAndDelete: true,
      }),
    );
  } catch {
    throw Error(
      `Memory smoke check failed at ${phase}. No credentials or response contents logged.`,
    );
  } finally {
    await browser.close();
    if (owner) await pool.query('DELETE FROM "user" WHERE id=$1', [owner]);
    await pool.end();
  }
}
main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
