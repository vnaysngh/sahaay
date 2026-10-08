import { verificationRequired } from "../../auth/email";
import { getPool } from "../../db";
import { getAuth } from "../../auth";
import { trustedOrigins } from "../../config";
import { RequestError } from "../../core/validation";
export async function requireUser(request: Request) {
  const session = await getAuth().api.getSession({ headers: request.headers });
  if (!session) throw new RequestError(401, "unauthorized", "Please sign in.");
  if (verificationRequired() && !session.user.emailVerified)
    throw new RequestError(
      403,
      "verify_email",
      "Please verify your email before continuing.",
    );
  return session.user;
}
export function requireOrigin(request: Request) {
  if (!trustedOrigins().includes(request.headers.get("origin") ?? ""))
    throw new RequestError(403, "origin", "This request was not allowed.");
}
export async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new RequestError(415, "content_type", "Send JSON.");
  const reader = request.body?.getReader();
  if (!reader) throw new RequestError(400, "body", "Missing request.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 20_000) {
      await reader.cancel();
      throw new RequestError(413, "size", "Message is too large.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new RequestError(400, "json", "Invalid message.");
  }
}
export function errorResponse(error: unknown) {
  if (error instanceof RequestError)
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  return Response.json(
    { error: "Sahaay is temporarily unavailable.", code: "unavailable" },
    { status: 503 },
  );
}

export async function requireProcessing(owner: string) {
  const row = (
    await getPool().query('SELECT processing_paused FROM "user" WHERE id=$1', [
      owner,
    ])
  ).rows[0];
  if (!row || row.processing_paused)
    throw new RequestError(
      403,
      "paused",
      "Your assistant is paused. Resume it in Privacy to continue.",
    );
}
