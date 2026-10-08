import "./scripts/env";
import { resolve } from "node:path";
import { defineConfig } from "@playwright/test";
const uri = new URL(
  process.env.DATABASE_URL ?? "postgresql://localhost/sahaay_test",
);
uri.pathname = "/sahaay_test";
export default defineConfig({
  testDir: "tests/web",
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: "http://localhost:3100",
    browserName: "chromium",
    launchOptions: {
      args: ["--use-fake-device-for-media-stream"],
    },
    trace: "off",
  },
  webServer: {
    command: "npm run db:migrate && npm run dev -w apps/web -- --port 3100",
    url: "http://localhost:3100/sign-in",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      DATABASE_URL: uri.toString(),
      BETTER_AUTH_URL: "http://localhost:3100",
      SAHAAY_E2E: "1",
      TELEGRAM_BOT_TOKEN: "123:browser-test-only-not-real",
      TELEGRAM_BOT_USERNAME: "sahaay_test_bot",
      SAHAAY_AUTH_EMAIL_CAPTURE: "1",
      SAHAAY_REQUIRE_VERIFICATION: "1",
      SAHAAY_AUTH_OUTBOX_DIR: resolve(".local/auth-outbox-test"),
      SAHAAY_DELETION_LEDGER_DIR: resolve(".local/deletions-test"),
      SAHAAY_MEDIA_DIR: resolve(".local/media-test"),
    },
  },
});
