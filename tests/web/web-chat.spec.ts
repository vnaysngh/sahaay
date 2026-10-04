import { test, expect } from "@playwright/test";
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
