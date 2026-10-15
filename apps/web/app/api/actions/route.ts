import { z } from "zod";
import { getPool } from "@/db";
import { ActionApprovals } from "@/core/approvals";
import {
  requireUser,
  requireOrigin,
  requireProcessing,
  readBody,
  errorResponse,
} from "@/channels/web/http";
import { RequestError } from "@/core/validation";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const value = new URL(request.url).searchParams.get("conversationId");
    if (value && !z.string().uuid().safeParse(value).success)
      throw new RequestError(400, "input", "Invalid conversation.");
    return Response.json(
      await new ActionApprovals(getPool()).list(user.id, value ?? undefined),
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser(request);
    await requireProcessing(user.id);
    const input = z
      .object({
        id: z.string().uuid(),
        decision: z.enum(["approve", "cancel"]),
      })
      .strict()
      .safeParse(await readBody(request));
    if (!input.success)
      throw new RequestError(
        400,
        "input",
        "Review the exact action before confirming.",
      );
    return Response.json(
      await new ActionApprovals(getPool()).decide(
        user.id,
        input.data.id,
        input.data.decision,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
