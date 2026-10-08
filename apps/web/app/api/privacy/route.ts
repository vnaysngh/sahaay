import { z } from "zod";
import { getPool } from "@/db";
import { getAuth } from "@/auth";
import { PostgresPrivacy } from "@/db/privacy";
import { cancelRuns } from "@/core/runs";
import {
  requireUser,
  requireOrigin,
  readBody,
  errorResponse,
} from "@/channels/web/http";
import { RequestError } from "@/core/validation";
export const runtime = "nodejs";
const input = z.discriminatedUnion("target", [
  z.object({ target: z.literal("pause"), paused: z.boolean() }).strict(),
  z
    .object({ target: z.literal("conversation"), id: z.string().uuid() })
    .strict(),
  z.object({ target: z.literal("chats") }).strict(),
  z
    .object({
      target: z.literal("account"),
      confirmation: z.literal("DELETE"),
      password: z.string().min(1).max(128),
    })
    .strict(),
]);
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json(
      await new PostgresPrivacy(getPool()).summary(user.id),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser(request);
    const parsed = input.safeParse(await readBody(request));
    if (!parsed.success)
      throw new RequestError(
        400,
        "input",
        "Choose a valid privacy action. Account deletion requires your password and DELETE confirmation.",
      );
    const action = parsed.data;
    if (action.target === "account") {
      const verified = await getAuth()
        .api.verifyPassword({
          headers: request.headers,
          body: { password: action.password },
        })
        .catch(() => ({ status: false }));
      if (!verified.status)
        throw new RequestError(
          403,
          "password",
          "Check your password and try again.",
        );
    }
    await new PostgresPrivacy(getPool()).change(user.id, action);
    if (action.target !== "pause" || action.paused)
      cancelRuns(
        user.id,
        action.target === "conversation" ? action.id : undefined,
      );
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
