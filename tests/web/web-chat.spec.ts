import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { imageFixture, audioFixture } from "../fixtures";
import { test, expect } from "@playwright/test";
test.beforeEach(async ({ context }) => {
  // Keep independent test accounts from sharing the authentication IP budget.
  const bytes = crypto.getRandomValues(new Uint8Array(2));
  await context.setExtraHTTPHeaders({
    "x-forwarded-for": `127.1.${bytes[0]}.${bytes[1]}`,
  });
});
async function signup(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await page.getByRole("button", { name: "Create an account" }).click();
  await page.getByLabel("Your name").fill("Kavya");
  const email = `test-${crypto.randomUUID()}@example.invalid`;
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password-only-42");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
  await expect(
    page.getByText(
      "Check your email for a verification link before signing in.",
    ),
  ).toBeVisible();
  let url = "";
  await expect
    .poll(async () => {
      for (const name of await readdir(".local/auth-outbox-test")) {
        const entry = JSON.parse(
          await readFile(join(".local/auth-outbox-test", name), "utf8"),
        );
        if (entry.to === email && entry.kind === "verify") {
          url = entry.url;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  await page.request.get(url);
  await page.goto("/sign-in?verified=1");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password-only-42");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A little help. A clearer day." }),
  ).toBeVisible();
}
test("sign in, stream, contextual follow-up, reload, history and errors", async ({
  page,
}) => {
  await signup(page);
  await page
    .getByRole("textbox", { name: "Message Sahaay" })
    .fill("My name is Kavya");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByText("Sahaay is thinking")).toBeVisible();
  await expect(
    page.getByText("Hello! Let’s think this through together."),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByRole("button", { name: "Send message", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Message Sahaay" })
    .fill("What name did I tell you?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByText("You told me your name is Kavya.")).toBeVisible();
  await page.reload();
  await page
    .getByRole("navigation", { name: "Conversation history" })
    .getByRole("button")
    .first()
    .click();
  await expect(page.getByText("You told me your name is Kavya.")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Message Sahaay" })
    .fill("simulate provider failure");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "couldn’t finish" }),
  ).toContainText("couldn’t finish");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
});
test("requires authentication and rejects cross-site submission", async ({
  request,
  page,
}) => {
  expect((await request.get("/api/inbox")).status()).toBe(401);
  const response = await request.get("/api/conversations");
  expect(response.status()).toBe(401);
  await signup(page);
  const wrongOrigin = await page.request.post("/api/conversations", {
    headers: { origin: "https://attacker.invalid" },
  });
  expect(wrongOrigin.status()).toBe(403);
  const inboxOrigin = await page.request.post("/api/inbox", {
    headers: { origin: "https://attacker.invalid" },
    data: { action: "timezone", timezone: "UTC" },
  });
  expect(inboxOrigin.status()).toBe(403);
});
test("mobile conversation window fits without a dashboard", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signup(page);
  await expect(
    page.getByRole("textbox", { name: "Message Sahaay" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open conversations" }).click();
  await expect(
    page.getByRole("button", { name: "New conversation" }),
  ).toBeVisible();
});

test("image upload, follow-up, history and denied foreign access", async ({
  page,
  browser,
}) => {
  await signup(page);
  await page.getByLabel("Upload images or audio").setInputFiles({
    name: "test.png",
    mimeType: "image/png",
    buffer: await imageFixture(),
  });
  await expect(page.locator(".pending-attachments img")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Message Sahaay" })
    .fill("Explain this image.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText("The test image contains a blue rectangle."),
  ).toBeVisible();
  const url = await page
    .locator(".message-attachments img")
    .getAttribute("src");
  expect(url).toBeTruthy();
  const outsider = await browser.newContext();
  const denied = await outsider.request.get(`http://localhost:3100${url}`);
  expect(denied.status()).toBe(401);
  await outsider.close();
  await page
    .getByRole("textbox", { name: "Message Sahaay" })
    .fill("What color was it?");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText("The test image contains a blue rectangle."),
  ).toHaveCount(2);
  await page.reload();
  await page
    .getByRole("navigation", { name: "Conversation history" })
    .getByRole("button")
    .first()
    .click();
  await expect(page.locator(".message-attachments img")).toBeVisible();
});
test("voice upload uses the common agent and exposes the transcript", async ({
  page,
}) => {
  await signup(page);
  await page.getByLabel("Upload images or audio").setInputFiles({
    name: "voice.wav",
    mimeType: "audio/wav",
    buffer: audioFixture(),
  });
  await expect(page.locator(".pending-attachments audio")).toBeVisible();
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText("I understood your voice message, Kavya."),
  ).toBeVisible();
  await page.getByText("Transcript · en-IN").click();
  await expect(
    page.getByText("This is a test voice message. My name is Kavya."),
  ).toBeVisible();
});
test("recording controls cancel and upload a deterministic capture fixture", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["microphone"]);
  await page.addInitScript((base64) => {
    // Model the hardware capture boundary; server audio decoding remains real.
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    navigator.mediaDevices.getUserMedia = async () => new MediaStream();
    class CaptureFixture {
      static isTypeSupported() {
        return true;
      }
      state = "inactive";
      mimeType = "audio/wav";
      ondataavailable: ((event: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      onerror: (() => void) | null = null;
      start() {
        this.state = "recording";
      }
      stop() {
        this.state = "inactive";
        queueMicrotask(() => {
          this.ondataavailable?.({
            data: new Blob([bytes], { type: this.mimeType }),
          });
          this.onstop?.();
        });
      }
    }
    Object.assign(window, { MediaRecorder: CaptureFixture });
  }, audioFixture().toString("base64"));
  await signup(page);
  await page.getByRole("button", { name: "Record voice", exact: true }).click();
  await expect(page.getByText(/Recording \d+s/)).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel recording", exact: true })
    .click();
  await expect(page.locator(".pending-attachments")).toHaveCount(0);
  await page.getByRole("button", { name: "Record voice", exact: true }).click();
  await expect(page.getByText("Recording 1s")).toBeVisible();
  await page
    .getByRole("button", { name: "Stop recording", exact: true })
    .click();
  await expect(page.locator(".pending-attachments audio")).toBeVisible();
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText("I understood your voice message, Kavya."),
  ).toBeVisible();
});
test("unsupported uploads and microphone denial have clear fallbacks", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: {
        getUserMedia: () =>
          Promise.reject(new DOMException("Denied", "NotAllowedError")),
      },
    });
  });
  await signup(page);
  await page.getByRole("button", { name: "Record voice", exact: true }).click();
  await expect(
    page.getByText(
      "Microphone access was denied or unavailable. You can upload audio with +.",
    ),
  ).toBeVisible();
  await page.getByLabel("Upload images or audio").setInputFiles({
    name: "test.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7"),
  });
  await expect(
    page.getByText(
      "Documents/PDFs are not supported yet. Send a screenshot instead.",
    ),
  ).toBeVisible();
});

test("research state, verified inline links, sources and persisted history", async ({
  page,
}) => {
  await signup(page);
  await page
    .getByRole("textbox", { name: "Message Sahaay" })
    .fill("Research https://example.com");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.getByText("Researching the web…")).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Research sources" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "1", exact: true }),
  ).toHaveAttribute("href", "https://example.com/research");
  await expect(page.locator(".source-link")).toHaveAttribute(
    "href",
    "https://example.com/research",
  );
  await page.reload();
  await page
    .getByRole("navigation", { name: "Conversation history" })
    .getByRole("button")
    .first()
    .click();
  await expect(
    page.getByRole("region", { name: "Research sources" }),
  ).toBeVisible();
});

test("memory across conversations, provenance, correction and physical forget", async ({
  page,
}) => {
  await signup(page);
  async function send(text: string, answer: string) {
    await page.getByRole("textbox", { name: "Message Sahaay" }).fill(text);
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page.locator(".message.assistant:not(.streaming)").last(),
    ).toContainText(answer);
  }
  await send(
    "Remember I prefer aisle seats on flights.",
    "Remembered your aisle seat preference.",
  );
  await page.getByRole("button", { name: /New conversation/ }).click();
  await send("What is my preferred flight seat?", "I prefer aisle seats");
  await send(
    "Actually I prefer window seats on flights.",
    "Updated your preference to window seats",
  );
  await send(
    "Why do you remember my flight seat preference?",
    "You explicitly asked",
  );
  await send(
    "Forget my flight seat preference.",
    "Forgotten your flight seat preference",
  );
  await page.getByRole("button", { name: /New conversation/ }).click();
  await send(
    "What is my preferred flight seat?",
    "I have no saved flight seat preference",
  );
});
test("saved idea persists through research failure and supports organization/removal", async ({
  page,
}) => {
  await signup(page);
  async function send(text: string, answer: string) {
    await page.getByRole("textbox", { name: "Message Sahaay" }).fill(text);
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(
      page.locator(".message.assistant:not(.streaming)").last(),
    ).toContainText(answer);
  }
  await send(
    "Save this video idea and simulate research failure: a quiet city walk at dawn.",
    "Item saved. The rest of this response could not be completed",
  );
  await page.getByRole("button", { name: /New conversation/ }).click();
  await send("Show my saved video ideas.", "A quiet city walk at dawn (saved)");
  await send(
    "Mark the city walk video idea done.",
    "Marked the city walk idea done",
  );
  await send("Show my saved video ideas.", "A quiet city walk at dawn (done)");
  await send(
    "Delete the saved city walk video idea.",
    "Removed the city walk video idea",
  );
  await send("Show my saved video ideas.", "No saved video ideas");
});

test("privacy pause/resume, owned chat deletion and password-confirmed account deletion", async ({
  page,
}) => {
  await signup(page);
  await page
    .getByRole("textbox", { name: "Message Sahaay" })
    .fill("My name is Kavya");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText("Hello! Let’s think this through together."),
  ).toBeVisible({ timeout: 15000 });
  await page.getByRole("button", { name: "Privacy", exact: true }).click();
  await page
    .getByRole("button", { name: "Pause assistant", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("textbox", { name: "Message Sahaay" })
    .fill("Hello while paused");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText(
      "Your assistant is paused. Resume it in Privacy to send messages.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "Privacy", exact: true }).click();
  await page
    .getByRole("button", { name: "Resume assistant", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page
    .getByRole("navigation", { name: "Conversation history" })
    .getByRole("button")
    .first()
    .click();
  await page.getByRole("button", { name: "Privacy", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete this conversation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm deletion", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "A little help. A clearer day." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Privacy", exact: true }).click();
  await page
    .getByRole("button", { name: "Delete account", exact: true })
    .click();
  await page
    .getByLabel("Current password")
    .fill("wrong-password-for-test-only");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page
    .getByRole("button", { name: "Confirm deletion", exact: true })
    .click();
  await expect(
    page.getByText("Check your password and try again.", { exact: true }),
  ).toBeVisible();
  expect((await page.request.get("/api/conversations")).status()).toBe(200);
  await page.getByLabel("Current password").fill("local-test-password-only-42");
  await page.getByLabel("Type DELETE to confirm").fill("DELETE");
  await page
    .getByRole("button", { name: "Confirm deletion", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  expect((await page.request.get("/api/conversations")).status()).toBe(401);
});
test("password recovery uses an expiring single-use link and revokes existing sessions", async ({
  page,
}) => {
  await signup(page);
  const session = await page.request.get("/api/auth/get-session");
  const email = (await session.json()).user.email as string;
  const reset = await page.request.post("/api/auth/request-password-reset", {
    headers: { origin: "http://localhost:3100" },
    data: { email, redirectTo: "http://localhost:3100/reset-password" },
  });
  expect(reset.ok()).toBe(true);
  let url = "";
  await expect
    .poll(async () => {
      for (const name of await readdir(".local/auth-outbox-test")) {
        const entry = JSON.parse(
          await readFile(join(".local/auth-outbox-test", name), "utf8"),
        );
        if (entry.to === email && entry.kind === "reset") {
          url = entry.url;
          return true;
        }
      }
      return false;
    })
    .toBe(true);
  await page.goto(url);
  await page.getByLabel("New password").fill("a-new-test-password-only-57");
  await page
    .getByRole("button", { name: "Reset password", exact: true })
    .click();
  await expect(
    page.getByText(
      "Password changed. Your previous sessions have been signed out.",
    ),
  ).toBeVisible();
  expect((await page.request.get("/api/conversations")).status()).toBe(401);
  await page.goto(url);
  await expect(
    page.getByText("This reset link is invalid or expired.", { exact: true }),
  ).toBeVisible();
  await page.goto("/sign-in");
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page
    .getByLabel("Password", { exact: true })
    .fill("a-new-test-password-only-57");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "A little help. A clearer day." }),
  ).toBeVisible();
});
test("unverified accounts cannot sign in or access chat and recovery does not enumerate emails", async ({
  page,
}) => {
  await page.goto("/sign-in");
  const origin = "http://localhost:3100",
    email = `unverified-${crypto.randomUUID()}@example.invalid`,
    password = "unverified-test-password-42";
  expect(
    (
      await page.request.post("/api/auth/sign-up/email", {
        headers: { origin },
        data: { name: "Unverified", email, password },
      })
    ).ok(),
  ).toBe(true);
  expect(
    (
      await page.request.post("/api/auth/sign-in/email", {
        headers: { origin },
        data: { email, password },
      })
    ).status(),
  ).toBe(403);
  expect((await page.request.get("/api/conversations")).status()).toBe(401);
  const responses = [];
  for (const value of [
    email,
    `unknown-${crypto.randomUUID()}@example.invalid`,
  ]) {
    const r = await page.request.post("/api/auth/request-password-reset", {
      headers: { origin },
      data: { email: value, redirectTo: `${origin}/reset-password` },
    });
    responses.push({ status: r.status(), body: await r.json() });
  }
  expect(responses[0]).toEqual(responses[1]);
});

test("deletion cannot be undone in the UI by an older in-flight history response", async ({
  page,
}) => {
  await signup(page);
  await page
    .getByRole("textbox", { name: "Message Sahaay" })
    .fill("private fixture for delayed history");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.locator(".message.assistant:not(.streaming)"),
  ).toBeVisible();
  const rows = await (await page.request.get("/api/conversations")).json();
  const id = rows[0].id as string;
  let release!: () => void,
    blocked = false;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**/api/conversations/${id}`, async (route) => {
    const response = await route.fetch();
    blocked = true;
    await gate;
    await route.fulfill({ response });
  });
  await page
    .getByRole("navigation", { name: "Conversation history" })
    .getByRole("button")
    .first()
    .click();
  await expect.poll(() => blocked).toBe(true);
  try {
    await page.getByRole("button", { name: "Privacy", exact: true }).click();
    await page
      .getByRole("button", { name: "Delete this conversation", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Confirm deletion", exact: true })
      .click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
  } finally {
    release();
  }
  await expect(
    page.getByRole("heading", { name: "A little help. A clearer day." }),
  ).toBeVisible();
  await expect(page.locator(".message")).toHaveCount(0);
  await expect(
    page
      .getByRole("navigation", { name: "Conversation history" })
      .getByRole("button"),
  ).toHaveCount(0);
});

test("Telegram account link UI requires sign-in/origin and does not expose the bot credential", async ({
  page,
}) => {
  await page.goto("/connect/telegram");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await signup(page);
  await page
    .getByRole("link", { name: "Connect Telegram", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Sahaay on Telegram." }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Create Telegram link", exact: true })
    .click();
  await expect(
    page.getByRole("link", { name: "Open Telegram app" }),
  ).toHaveAttribute(
    "href",
    /^tg:\/\/resolve\?domain=sahaay_test_bot&start=[a-zA-Z0-9_-]{43}$/,
  );
  await expect(
    page.getByRole("link", { name: "Open Telegram Web" }),
  ).toHaveAttribute(
    "href",
    /^https:\/\/web\.telegram\.org\/k\/#\?tgaddr=tg%3A%2F%2Fresolve%3Fdomain%3Dsahaay_test_bot%26start%3D[a-zA-Z0-9_-]{43}$/,
  );
  await expect(page.locator("code")).toHaveText(/^\/start [a-zA-Z0-9_-]{43}$/);
  await page.route("**/api/telegram/link", async (route) => {
    if (route.request().method() === "GET")
      await route.fulfill({ json: { linked: true } });
    else await route.continue();
  });
  await expect(page.getByRole("status")).toContainText(
    "Connected — your Telegram account is linked",
    { timeout: 10000 },
  );
  await expect(page.locator("code")).toHaveCount(0);
  expect(await page.locator("body").innerText()).not.toContain(
    "browser-test-only-not-real",
  );
  expect(
    (
      await page.request.post("/api/telegram/link", {
        headers: { origin: "https://evil.example" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.post("/api/telegram", {
        headers: { authorization: "Bearer wrong" },
        data: { update_id: 1 },
      })
    ).status(),
  ).toBe(401);
});

test("personal state accumulates outside chat and object details survive navigation", async ({
  page,
}) => {
  await signup(page);
  async function send(text: string, answer: string) {
    await page.getByRole("textbox", { name: "Message Sahaay" }).fill(text);
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
    await expect(page.getByText(answer, { exact: true })).toBeVisible({
      timeout: 15000,
    });
  }
  await send(
    "I'm thinking about going to Japan in December.",
    "Kept your Japan trip in planning for December.",
  );
  await send(
    "Save this hotel for Japan: https://example.com/kyoto-hotel",
    "Saved Kyoto hotel for your Japan trip.",
  );
  await send(
    "Save these to my cart: Gym shoes, Swimming goggles, Dashcam.",
    "Saved three items to your cart.",
  );
  await page.getByRole("link", { name: "Your space", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Your space" })).toBeVisible();
  await expect(page.getByText("December", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Shopping", exact: false }).click();
  await expect(
    page.getByRole("region", { name: "Shopping", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Gym shoes", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Japan trip", exact: true }),
  ).toHaveCount(0);
  await page.screenshot({
    path: "/tmp/sahaay-state-shopping.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Trips", exact: false }).click();
  await expect(
    page.getByRole("button", { name: "Trips", exact: false }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/sahaay-state-mobile.png",
    fullPage: true,
  });
  await page.getByRole("link", { name: "Japan trip", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Japan trip", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Kyoto hotel", exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("link", { name: "Open saved link" }),
  ).toHaveAttribute("href", "https://example.com/kyoto-hotel");
  await page.getByRole("link", { name: "Talk to Sahaay", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Message Sahaay" }),
  ).toBeVisible();
});

test("M7 Inbox confirms timezone, creates through chat, reschedules, opens and dismisses shared follow-ups", async ({
  page,
}) => {
  await signup(page);
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Inbox", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Confirm your timezone before asking for reminders.", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByLabel("Your timezone", { exact: true }).fill("Asia/Kolkata");
  await page.getByRole("button", { name: "Confirm timezone" }).click();
  await expect(page.getByText("Confirmed: Asia/Kolkata")).toBeVisible();
  await page
    .getByRole("link", { name: "Talk to Sahaay", exact: true })
    .first()
    .click();
  const send = async (text: string) => {
    await page.getByRole("textbox", { name: "Message Sahaay" }).fill(text);
    await page
      .getByRole("button", { name: "Send message", exact: true })
      .click();
  };
  await send("I'm thinking about going to Japan in December.");
  await expect(
    page.getByText("Kept your Japan trip in planning for December."),
  ).toBeVisible();
  await send("Remind me tomorrow at 10 AM to research flights for Japan.");
  await expect(
    page.getByText(
      "Scheduled your Japan flight-research reminder for tomorrow at 10 AM.",
    ),
  ).toBeVisible();
  await page.getByRole("link", { name: "Inbox", exact: true }).click();
  const row = page
    .locator(".inbox-row")
    .filter({ hasText: "Research flights for Japan" });
  await expect(row).toHaveCount(1);
  await expect(row.getByRole("heading", { name: "Japan trip" })).toBeVisible();
  const initial = await (await page.request.get("/api/inbox")).json();
  await page.reload();
  await row.getByText("More", { exact: true }).click();
  await expect(
    row.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeVisible();
  const noConfirmation = await page.request.post("/api/inbox", {
    headers: { Origin: "http://localhost:3100" },
    data: {
      action: "cancel",
      id: initial.recent[0].id,
      version: initial.recent[0].version,
    },
  });
  expect(noConfirmation.status()).toBe(400);
  await row.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Confirm stopping reminder" }),
  ).toBeVisible();
  expect(
    (await (await page.request.get("/api/inbox")).json()).recent[0].status,
  ).toBe("scheduled");
  await page
    .getByRole("button", { name: "Keep reminder", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await row.getByRole("button", { name: "Details", exact: true }).click();
  await expect(
    row.getByText("Why this is here:", { exact: false }),
  ).toBeVisible();
  await row.getByRole("button", { name: "Reschedule", exact: true }).click();
  const current = await page.getByLabel("New date and time").inputValue();
  await page
    .getByLabel("New date and time")
    .fill(current.slice(0, 10) + "T14:00");
  await row.getByRole("button", { name: "Save time" }).click();
  await expect(row.getByLabel("New date and time")).toHaveCount(0);
  await expect(
    row.getByRole("button", { name: "Details", exact: true }),
  ).toBeVisible();
  const data = await (await page.request.get("/api/inbox")).json();
  expect(data.recent).toHaveLength(1);
  expect(data.recent[0].scheduledFor).toContain("T08:30:00");
  await page.screenshot({ path: "/tmp/sahaay-m7-inbox.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/sahaay-m7-inbox-mobile.png",
    fullPage: true,
  });
  await row.getByRole("button", { name: "Dismiss", exact: true }).click();
  await expect(
    page.getByRole("alertdialog", { name: "Confirm stopping reminder" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Dismiss reminder", exact: true })
    .click();
  await expect(page.getByText("Closed · 1")).toBeVisible();
  const after = await (await page.request.get("/api/inbox")).json();
  expect(after.recent[0].status).toBe("dismissed");
  await page
    .getByRole("link", { name: "Talk to Sahaay", exact: true })
    .first()
    .click();
  await send("What follow-ups do I have?");
  await expect(page.getByText("No active follow-ups.")).toBeVisible();
});

test("Documents keep original bytes, require ownership and delete durably", async ({
  page,
  browser,
}) => {
  await signup(page);
  const image = await imageFixture();
  await page.getByLabel("Upload images or audio").setInputFiles({
    name: "private.png",
    mimeType: "image/png",
    buffer: image,
  });
  await expect(page.locator(".pending-attachments img")).toBeVisible();
  await page
    .getByRole("textbox", { name: "Message Sahaay" })
    .fill("Keep my Aadhaar.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText("Kept your Aadhaar image in Documents."),
  ).toBeVisible();
  await page.getByRole("link", { name: "Documents", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Documents", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Aadhaar Card.*Open/ }).click();
  await expect(
    page.getByText("42 Synthetic Road, Pune", { exact: true }),
  ).toBeVisible();
  const url = await page
    .getByRole("link", { name: "Download original" })
    .getAttribute("href");
  expect(url).toBeTruthy();
  const original = await page.request.get(url!);
  expect(original.status()).toBe(200);
  expect((await original.body()).equals(image)).toBe(true);
  expect(original.headers()["cache-control"]).toContain("no-store");
  const id = url!.split("/")[3];
  expect(
    (
      await page.request.delete(`/api/documents/${id}`, {
        headers: { Origin: "https://other.invalid" },
        data: { version: 1 },
      })
    ).status(),
  ).toBe(403);
  await page.screenshot({
    path: "/tmp/sahaay-documents-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "/tmp/sahaay-documents-mobile.png",
    fullPage: true,
  });
  const outsider = await browser.newContext({
    extraHTTPHeaders: { "x-forwarded-for": "127.2.3.4" },
  });
  const other = await outsider.newPage();
  await signup(other);
  expect((await other.request.get(url!)).status()).toBe(404);
  expect((await other.request.get(`/api/documents/${id}`)).status()).toBe(404);
  expect(
    (
      await other.request.delete(`/api/documents/${id}`, {
        headers: { Origin: "http://localhost:3100" },
        data: { version: 1 },
      })
    ).status(),
  ).toBe(404);
  await outsider.close();
  await page
    .getByRole("button", { name: "Delete document", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Delete permanently", exact: true })
    .click();
  await expect(page.getByText(/No documents yet/)).toBeVisible();
  expect((await page.request.get(url!)).status()).toBe(404);
});

test("Open Sans and persistent light/dark appearance work across the assistant surfaces", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await signup(page);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.evaluate(() => document.fonts.ready);
  expect(
    await page.evaluate(() => {
      let loaded = false;
      document.fonts.forEach((font) => {
        if (
          font.status === "loaded" &&
          font.family.toLowerCase().includes("opensans")
        )
          loaded = true;
      });
      return loaded;
    }),
  ).toBe(true);
  expect(
    await page.evaluate(() => getComputedStyle(document.body).fontFamily),
  ).toContain("Open Sans");
  await page.screenshot({ path: "/tmp/sahaay-chat-dark.png" });
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.screenshot({ path: "/tmp/sahaay-chat-light.png" });
  for (const route of [
    "/state",
    "/documents",
    "/inbox",
    "/connect/telegram",
    "/privacy",
  ]) {
    await page.goto(route);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: "Switch to dark mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
    ).toBe("rgb(21, 27, 24)");
    await page.getByRole("button", { name: "Switch to light mode" }).click();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await page.screenshot({ path: "/tmp/sahaay-chat-dark-mobile.png" });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
