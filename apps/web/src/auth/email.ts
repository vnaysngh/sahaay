import nodemailer from "nodemailer";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { z } from "zod";
export function emailConfigured() {
  return Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASSWORD &&
    process.env.SMTP_FROM,
  );
}
export function verificationRequired() {
  return (
    process.env.SAHAAY_REQUIRE_VERIFICATION === "1" ||
    (process.env.NODE_ENV === "production" &&
      process.env.SAHAAY_LOCAL_PREVIEW !== "1")
  );
}
export async function sendAuthEmail(
  to: string,
  kind: "verify" | "reset",
  url: string,
) {
  // Private synthetic-test outbox, never enabled for a deployed app or real recipients.
  if (process.env.SAHAAY_AUTH_EMAIL_CAPTURE === "1") {
    if (
      process.env.NODE_ENV === "production" ||
      process.env.SAHAAY_E2E !== "1" ||
      !to.endsWith("@example.invalid")
    )
      throw Error("Unsafe test email configuration");
    const root = resolve(
      /* turbopackIgnore: true */ process.env.SAHAAY_AUTH_OUTBOX_DIR ??
        ".local/auth-outbox",
    );
    await mkdir(root, { recursive: true, mode: 0o700 });
    await writeFile(
      join(root, `${crypto.randomUUID()}.json`),
      JSON.stringify({ to, kind, url }),
      { mode: 0o600, flag: "wx" },
    );
    return;
  }
  const parsed = z
    .object({
      SMTP_HOST: z.string().min(1),
      SMTP_PORT: z.coerce
        .number()
        .int()
        .refine((v) => v === 465 || v === 587),
      SMTP_USER: z.string().min(1),
      SMTP_PASSWORD: z.string().min(1),
      SMTP_FROM: z.string().email(),
    })
    .safeParse(process.env);
  if (!parsed.success) throw Error("Transactional email is not configured");
  const c = parsed.data;
  const transport = nodemailer.createTransport({
    host: c.SMTP_HOST,
    port: c.SMTP_PORT,
    secure: c.SMTP_PORT === 465,
    requireTLS: true,
    auth: { user: c.SMTP_USER, pass: c.SMTP_PASSWORD },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    logger: false,
    debug: false,
  });
  await transport.sendMail({
    from: c.SMTP_FROM,
    to,
    subject:
      kind === "verify"
        ? "Verify your Sahaay email"
        : "Reset your Sahaay password",
    text: `${kind === "verify" ? "Verify your email to sign in to Sahaay" : "Reset your Sahaay password"}:\n\n${url}\n\nIf you did not request this, you can ignore this email.`,
  });
}
