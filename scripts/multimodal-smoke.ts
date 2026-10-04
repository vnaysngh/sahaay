import "./env";
import { chromium } from "@playwright/test";
import { Pool } from "pg";
import { randomBytes } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import sharp from "sharp";
import { MediaFiles } from "../apps/web/src/media/files";
async function main() {
  const origin = "http://localhost:3000";
  const browser = await chromium.launch();
  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let userId: string | undefined;
  const mediaIds: string[] = [];
  let phase = "sign-in";
  try {
    const signup = await context.request.post("/api/auth/sign-up/email", {
      headers: { origin },
      data: {
        name: "Preview",
        email: `media-${randomBytes(8).toString("hex")}@example.invalid`,
        password: randomBytes(24).toString("hex"),
      },
    });
    if (!signup.ok()) throw new Error("signup");
    userId = (await signup.json()).user.id;
    await page.goto("/");
    phase = "images";
    for (const [index, color] of ["blue", "green"].entries()) {
      phase = `image-${color}`;
      const buffer = await sharp({
        create: { width: 320, height: 200, channels: 3, background: color },
      })
        .png()
        .toBuffer();
      await page.getByLabel("Upload images or audio").setInputFiles({
        name: `sample-${color}.png`,
        mimeType: "image/png",
        buffer,
      });
      await page.locator(".pending-attachments img").waitFor();
      await page
        .getByRole("textbox", { name: "Message Sahaay" })
        .fill(
          index === 0
            ? "What color is this image? One short sentence in English."
            : "Compare this image with the first image. Name both colors, briefly in English.",
        );
      await page
        .getByRole("button", { name: "Send message", exact: true })
        .click();
      const response = page
        .locator(".message.assistant:not(.streaming)")
        .nth(index);
      await response.waitFor({ timeout: 180000 });
      const text = await response.textContent();
      if (
        !text?.toLowerCase().includes(color) ||
        (index === 1 && !text.toLowerCase().includes("blue"))
      )
        throw new Error("image reasoning");
    }
    phase = "image-followup";
    await page
      .getByRole("textbox", { name: "Message Sahaay" })
      .fill("Which color did I send first? Reply with only the color.");
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    const followup = page.locator(".message.assistant:not(.streaming)").nth(2);
    await followup.waitFor({ timeout: 180000 });
    if (!(await followup.textContent())?.toLowerCase().includes("blue"))
      throw new Error("image follow-up");
    await mkdir(".local", { recursive: true });
    await page.screenshot({ path: ".local/chat-multimodal.png" });
    const voiceResults = [];
    for (const [filename, language] of [
      ["shot1.mp3", "en-IN"],
      ["shot2.mp3", "hi-IN"],
    ]) {
      phase = `voice-${language}`;
      const upload = await context.request.post("/api/attachments", {
        headers: {
          origin,
          "content-type": "audio/mpeg",
          "x-file-name": filename,
        },
        data: await readFile(filename),
      });
      if (!upload.ok()) throw new Error("audio upload");
      const attachment = await upload.json();
      const conversation = await context.request.post("/api/conversations", {
        headers: { origin },
      });
      if (!conversation.ok()) throw new Error("conversation");
      const { id } = await conversation.json();
      const reply = await context.request.post("/api/chat", {
        headers: { origin },
        data: {
          conversationId: id,
          requestId: crypto.randomUUID(),
          text: "",
          attachmentIds: [attachment.id],
        },
        timeout: 190000,
      });
      if (!reply.ok()) throw new Error("voice request");
      const events = (await reply.text())
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      if (
        events.some((event) => event.type === "error") ||
        !events.some((event) => event.type === "complete" && event.text.trim())
      )
        throw new Error("voice response");
      const history = await context.request.get(`/api/conversations/${id}`);
      const messages = await history.json();
      const source = messages
        .flatMap(
          (message: {
            attachments: Array<{
              transcript: string;
              metadata: { provider: string; detectedLanguage: string };
            }>;
          }) => message.attachments ?? [],
        )
        .find((item: { transcript: string }) => item.transcript);
      if (
        source?.metadata?.provider !== "sarvam" ||
        source.metadata.detectedLanguage !== language
      )
        throw new Error("transcription metadata");
      const completed = events.find((event) => event.type === "complete");
      if (language === "hi-IN" && !/[\u0900-\u097f]/.test(completed.text))
        throw new Error("Hindi response");
      voiceResults.push({ language, transcribed: true, responded: true });
    }
    console.log(
      JSON.stringify({
        passed: true,
        realOpenAI: true,
        imageComparison: true,
        imageFollowup: true,
        sarvam: voiceResults,
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        phase,
        errorType: error instanceof Error ? error.name : "unknown",
      }),
    );
    throw new Error(
      `Live multimodal check failed at ${phase}; no secrets or message content logged.`,
    );
  } finally {
    await browser.close();
    if (userId) {
      const files = await pool.query(
        "SELECT id FROM attachments WHERE user_id=$1",
        [userId],
      );
      mediaIds.push(...files.rows.map((row) => row.id));
      await pool.query('DELETE FROM "user" WHERE id=$1', [userId]);
      const media = new MediaFiles();
      for (const id of mediaIds) await media.remove(id);
    }
    await pool.end();
  }
}
main().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});
