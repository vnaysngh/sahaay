import { getPool } from "@/db";
import { PostgresArtifacts } from "@/db/artifacts";
import { requireUser, errorResponse } from "@/channels/web/http";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json(
      await new PostgresArtifacts(getPool()).search(user.id, null),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
