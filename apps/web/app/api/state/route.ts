import { z } from "zod";
import { getPool } from "@/db";
import { lifeState } from "@/db/life-state";
import { requireUser, errorResponse } from "@/channels/web/http";
import { RequestError } from "@/core/validation";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request),
      url = new URL(request.url);
    const query = z
      .object({
        page: z.coerce.number().int().min(0).max(25),
        object: z.string().uuid().optional(),
      })
      .safeParse({
        page: url.searchParams.get("page") ?? 0,
        object: url.searchParams.get("object") ?? undefined,
      });
    if (!query.success)
      throw new RequestError(400, "input", "Choose a valid state page.");
    const result = await lifeState(
      getPool(),
      user.id,
      query.data.object,
      query.data.page,
    );
    if (!result) throw new RequestError(404, "not_found", "State not found.");
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
