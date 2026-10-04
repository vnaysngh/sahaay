import "./env";
import { chromium } from "@playwright/test";
import { Pool } from "pg";
import { randomBytes } from "node:crypto";
import { mkdir } from "node:fs/promises";
async function main() {
  const origin = "http://localhost:3000";
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let id: string | undefined;
  let phase = "auth";
  try {
    const signup = await context.request.post("/api/auth/sign-up/email", {
      headers: { origin },
      data: {
        name: "Preview",
        email: `research-${randomBytes(8).toString("hex")}@example.invalid`,
        password: randomBytes(24).toString("hex"),
      },
    });
    if (!signup.ok()) throw new Error("auth");
    id = (await signup.json()).user.id;
    await page.goto("/");
    const urlsOnly = process.argv.includes("--urls-only");
    if (!urlsOnly) {
      phase = "comparison";
      await page
        .getByRole("textbox", { name: "Message Sahaay" })
        .fill(
          "Research the USB data-transfer rates of iPhone 16 versus iPhone 16 Pro using official Apple specifications. Distinguish the USB-C connector from its USB protocol. Be brief.",
        );
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .click();
      await page.getByText("Researching the web…").waitFor({ timeout: 60000 });
      const response = page
        .locator(".message.assistant:not(.streaming)")
        .first();
      await response.waitFor({ timeout: 190000 });
      const text = await response.textContent();
      if (!text || !/480/.test(text) || !/10/.test(text) || !/Gb/.test(text))
        throw new Error("specification grounding");
      const hrefs = await page
        .locator(".source-link")
        .evaluateAll((links) =>
          links.map((link) => (link as HTMLAnchorElement).href),
        );
      if (
        !hrefs.length ||
        !hrefs.some((url) => new URL(url).hostname.endsWith("apple.com"))
      )
        throw new Error("sources");
      await mkdir(".local", { recursive: true });
      await page.screenshot({ path: ".local/chat-research.png" });
      await page.reload();
      await page
        .getByRole("navigation", { name: "Conversation history" })
        .getByRole("button")
        .first()
        .click();
      await page.getByRole("region", { name: "Research sources" }).waitFor();
    }
    phase = "public-url";
    await page.getByRole("button", { name: /New conversation/ }).click();
    await page
      .getByRole("textbox", { name: "Message Sahaay" })
      .fill(
        "Summarize https://science.nasa.gov/mars/facts/ in 3 bullets. State whether the actual page was accessible. Cite the evidence.",
      );
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await page
      .locator(".message.assistant:not(.streaming)")
      .first()
      .waitFor({ timeout: 190000 });
    const nasa = await page
      .locator(".source-link")
      .evaluateAll((links) =>
        links.map((link) => (link as HTMLAnchorElement).href),
      );
    if (!nasa.some((url) => new URL(url).hostname.endsWith("nasa.gov")))
      throw new Error("public URL evidence");
    phase = "document-limit";
    await page
      .getByRole("textbox", { name: "Message Sahaay" })
      .fill("Read https://example.com/private/report.pdf");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await page
      .locator(".message.assistant:not(.streaming)")
      .nth(1)
      .waitFor({ timeout: 190000 });
    const unsupported = await page
      .locator(".message.assistant:not(.streaming)")
      .nth(1)
      .textContent();
    if (
      !unsupported ||
      !/screenshot|paste|not.*support|cannot|can't|can’t/i.test(unsupported)
    )
      throw new Error("document limit");
    console.log(
      JSON.stringify({
        passed: true,
        realAgent: true,
        realOpenAISearch: true,
        comparisonSpecs: !urlsOnly,
        clickableSources: true,
        reloadedSources: !urlsOnly,
        publicURL: true,
        unsupportedPDF: true,
      }),
    );
  } catch {
    throw new Error(
      `Research smoke check failed at ${phase}. No credentials or response contents logged.`,
    );
  } finally {
    await browser.close();
    if (id) await pool.query('DELETE FROM "user" WHERE id=$1', [id]);
    await pool.end();
  }
}
main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
