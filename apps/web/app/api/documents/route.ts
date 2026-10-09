import { z } from "zod";
import { RequestError } from "@/core/validation";
import { getPool } from "@/db";
import { PostgresArtifacts } from "@/db/artifacts";
import { requireUser, errorResponse } from "@/channels/web/http";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const query = z
      .string()
      .trim()
      .max(200)
      .safeParse(new URL(request.url).searchParams.get("q") ?? "");
    if (!query.success)
      throw new RequestError(400, "query", "Use a shorter search.");
    return Response.json(
      await new PostgresArtifacts(getPool()).search(
        user.id,
        query.data || null,
      ),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
