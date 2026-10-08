import { sendAuthEmail, verificationRequired, emailConfigured } from "./email";
import { after } from "next/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { getDb } from "../db";
import * as schema from "../db/schema";
import { getConfig, trustedOrigins } from "../config";
export function createAuth() {
  const config = getConfig();
  return betterAuth({
    secret: config.BETTER_AUTH_SECRET,
    baseURL: config.BETTER_AUTH_URL,
    trustedOrigins: trustedOrigins(),
    database: drizzleAdapter(getDb(), { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      maxPasswordLength: 128,
      requireEmailVerification: verificationRequired(),
      autoSignIn: !verificationRequired(),
      resetPasswordTokenExpiresIn: 1800,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword:
        emailConfigured() || process.env.SAHAAY_AUTH_EMAIL_CAPTURE === "1"
          ? async ({ user, url }) => {
              after(async () => {
                try {
                  await sendAuthEmail(user.email, "reset", url);
                } catch {
                  console.error("Password reset email delivery failed");
                }
              });
            }
          : undefined,
    },
    emailVerification: {
      sendOnSignUp: verificationRequired(),
      sendOnSignIn: verificationRequired(),
      expiresIn: 3600,
      sendVerificationEmail: async ({ user, url }) => {
        after(async () => {
          try {
            await sendAuthEmail(user.email, "verify", url);
          } catch {
            console.error("Verification email delivery failed");
          }
        });
      },
    },
    session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 30,
      customRules: {
        "/request-password-reset": { window: 60, max: 3 },
        "/send-verification-email": { window: 60, max: 3 },
        "/sign-in/email": { window: 60, max: 8 },
      },
    },
    telemetry: { enabled: false },
    logger: {
      level: "error",
      log: () => console.error("Authentication request failed"),
    },
  });
}
let auth: ReturnType<typeof createAuth> | undefined;
export function getAuth() {
  return (auth ??= createAuth());
}
