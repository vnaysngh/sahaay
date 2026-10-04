import { config } from "dotenv";
import { resolve } from "node:path";
import type { NextConfig } from "next";
config({ path: resolve(process.cwd(), "../../.env.local"), quiet: true });
config({ path: resolve(process.cwd(), "../../.env"), quiet: true });
const configNext: NextConfig = {
  distDir: process.env.SAHAAY_E2E === "1" ? ".next-test" : ".next",
  poweredByHeader: false,
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
    ];
  },
};
export default configNext;
