import { config } from "dotenv";
import { resolve } from "node:path";
import type { NextConfig } from "next";
config({ path: resolve(process.cwd(), "../../.env.local"), quiet: true });
config({ path: resolve(process.cwd(), "../../.env"), quiet: true });
process.env.SAHAAY_MEDIA_DIR ??= resolve(process.cwd(), "../../.local/media");
process.env.SAHAAY_DELETION_LEDGER_DIR ??= resolve(
  process.cwd(),
  "../../.local/deletions",
);
const configNext: NextConfig = {
  distDir: process.env.SAHAAY_E2E === "1" ? ".next-test" : ".next",
  poweredByHeader: false,
  logging: { incomingRequests: { ignore: [/\/api\/connections\/google\/callback/, /\/connect\/google\/complete/] } },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "same-origin" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), microphone=(self)",
          },
        ],
      },
      { source: "/connect/google/complete", headers: [{ key: "Referrer-Policy", value: "no-referrer" }, { key: "Cache-Control", value: "no-store" }] },
    ];
  },
};
export default configNext;
