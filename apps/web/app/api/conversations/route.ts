import { getPool } from "@/db";
import { PostgresConversations } from "@/db/conversations";
import { requireUser, requireOrigin, errorResponse } from "@/channels/web/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json(
      await new PostgresConversations(getPool()).list(user.id),
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
    return Response.json(
      await new PostgresConversations(getPool()).create(user.id),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
