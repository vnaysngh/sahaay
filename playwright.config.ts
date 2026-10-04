import "./scripts/env";
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
    },
  },
});
