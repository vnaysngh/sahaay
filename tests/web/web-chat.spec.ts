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
  await page
    .getByLabel("Email", { exact: true })
    .fill(`test-${crypto.randomUUID()}@example.invalid`);
  await page
    .getByLabel("Password", { exact: true })
    .fill("local-test-password-only-42");
  await page
    .getByRole("button", { name: "Create account", exact: true })
    .click();
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
  ).toBeVisible();
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
  const response = await request.get("/api/conversations");
  expect(response.status()).toBe(401);
  await signup(page);
  const wrongOrigin = await page.request.post("/api/conversations", {
    headers: { origin: "https://attacker.invalid" },
  });
  expect(wrongOrigin.status()).toBe(403);
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
test("microphone recording can be cancelled and completed without using a real device", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["microphone"]);
  await page.addInitScript(() => {
    // Keep generated sources alive for both recordings; no real microphone.
    const audioContexts: AudioContext[] = [];
    navigator.mediaDevices.getUserMedia = async () => {
      const audio = new AudioContext();
      audioContexts.push(audio);
      const destination = audio.createMediaStreamDestination();
      const oscillator = audio.createOscillator();
      oscillator.connect(destination);
      oscillator.start();
      await audio.resume();
      return destination.stream;
    };
  });
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
