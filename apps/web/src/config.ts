import { z } from "zod";
const schema = z.object({
  DATABASE_URL: z.string().min(1),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_MODEL: z.string().default("gpt-5.4-mini-2026-03-17"),
});
export function getConfig() {
  const result = schema.safeParse(process.env);
  if (!result.success)
    throw new Error(
      `Missing or invalid server configuration: ${result.error.issues.map((i) => i.path[0]).join(", ")}`,
    );
  if (
    process.env.NODE_ENV === "production" &&
    !result.data.BETTER_AUTH_URL.startsWith("https://") &&
    process.env.SAHAAY_LOCAL_PREVIEW !== "1"
  )
    throw new Error("Production authentication requires HTTPS");
  if (
    process.env.SAHAAY_LOCAL_PREVIEW === "1" &&
    !["localhost", "127.0.0.1"].includes(
      new URL(result.data.BETTER_AUTH_URL).hostname,
    )
  )
    throw new Error("Local preview must use a loopback origin");
  return result.data;
}

export function trustedOrigins() {
  const uri = new URL(getConfig().BETTER_AUTH_URL);
  const origins = [uri.origin];
  if (
    (process.env.NODE_ENV !== "production" ||
      process.env.SAHAAY_LOCAL_PREVIEW === "1") &&
    ["localhost", "127.0.0.1"].includes(uri.hostname)
  ) {
    uri.hostname = uri.hostname === "localhost" ? "127.0.0.1" : "localhost";
    origins.push(uri.origin);
  }
  return origins;
}
