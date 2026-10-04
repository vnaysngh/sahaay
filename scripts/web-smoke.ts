import "./env";
import { chromium } from "@playwright/test";
import { Pool } from "pg";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
async function main() {
  const baseURL = "http://localhost:3000";
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  let id: string | undefined;
  try {
    const signup = await context.request.post("/api/auth/sign-up/email", {
      headers: { origin: baseURL },
      data: {
        name: "Preview",
        email: `preview-${randomBytes(8).toString("hex")}@example.invalid`,
        password: randomBytes(24).toString("hex"),
      },
    });
    if (!signup.ok()) throw new Error("sign-up failed");
    id = (await signup.json()).user.id;
    await page.goto("/");
    await page
      .getByRole("heading", { name: "A little help. A clearer day." })
      .waitFor();
    await mkdir(".local", { recursive: true });
    await page.screenshot({ path: ".local/chat-desktop.png" });
    await page
      .getByRole("textbox", { name: "Message Sahaay" })
      .fill("For this fictional test, my name is Kavya. Greet me briefly.");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await page
      .locator(".message.assistant:not(.streaming)")
      .first()
      .waitFor({ timeout: 120000 });
    await page
      .getByRole("textbox", { name: "Message Sahaay" })
      .fill("What name did I tell you? Reply in Hindi, briefly.");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await page
      .locator(".message.assistant:not(.streaming)")
      .nth(1)
      .waitFor({ timeout: 120000 });
    const reply = await page
      .locator(".message.assistant:not(.streaming)")
      .nth(1)
      .textContent();
    if (
      !reply ||
      !/[\u0900-\u097f]/.test(reply) ||
      !/काव्या|काव्य|Kavya|काविया/.test(reply)
    )
      throw new Error("context/language check failed");
    await page.screenshot({ path: ".local/chat-response.png" });
    await page.reload();
    await page
      .getByRole("navigation", { name: "Conversation history" })
      .getByRole("button")
      .first()
      .click();
    await page.locator(".message.assistant").nth(1).waitFor();
    console.log(
      JSON.stringify({
        passed: true,
        realWebAuth: true,
        realOpenAIResponses: 2,
        contextRecall: true,
        hindiReply: true,
        reloadedHistory: true,
      }),
    );
  } finally {
    await browser.close();
    if (id) {
      const pool = new Pool({ connectionString: process.env.DATABASE_URL });
      await pool.query('DELETE FROM "user" WHERE id=$1', [id]);
      await pool.end();
    }
  }
}
main().catch(() => {
  console.error(
    "Live web smoke check failed. No secrets or response content were logged.",
  );
  process.exitCode = 1;
});
