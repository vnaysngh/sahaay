import { z } from "zod";
import { getPool } from "@/db";
import { PostgresArtifacts } from "@/db/artifacts";
import {
  requireUser,
  requireOrigin,
  readBody,
  errorResponse,
} from "@/channels/web/http";
import { RequestError } from "@/core/validation";
async function owned(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser(request),
    { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success)
    throw new RequestError(400, "id", "Invalid document.");
  return { user, id, store: new PostgresArtifacts(getPool()) };
}
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user, id, store } = await owned(request, context);
    return Response.json(await store.get(user.id, id), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireOrigin(request);
    const { user, id, store } = await owned(request, context),
      parsed = z
        .object({ version: z.number().int().positive() })
        .strict()
        .safeParse(await readBody(request));
    if (!parsed.success)
      throw new RequestError(
        400,
        "version",
        "Reload the document and try again.",
      );
    await store.deleteWeb(user.id, id, parsed.data.version);
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
