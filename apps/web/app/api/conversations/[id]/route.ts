import { z } from "zod";
import { getPool } from "@/db";
import { PostgresConversations } from "@/db/conversations";
import { requireUser, errorResponse } from "@/channels/web/http";
import { RequestError } from "@/core/validation";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request);
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success)
      throw new RequestError(400, "id", "Invalid conversation.");
    return Response.json(
      await new PostgresConversations(getPool()).history(user.id, id),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
