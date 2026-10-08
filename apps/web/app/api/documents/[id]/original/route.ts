import { z } from "zod";
import { getPool } from "@/db";
import { PostgresArtifacts } from "@/db/artifacts";
import { requireUser, errorResponse } from "@/channels/web/http";
import { RequestError } from "@/core/validation";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser(request),
      { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success)
      throw new RequestError(400, "id", "Invalid document.");
    const { artifact, data } = await new PostgresArtifacts(
      getPool(),
    ).getOriginal(user.id, id);
    const ext =
      artifact.mime === "image/png"
        ? "png"
        : artifact.mime === "image/webp"
          ? "webp"
          : "jpg";
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": artifact.mime,
        "Content-Disposition": `${new URL(request.url).searchParams.has("download") ? "attachment" : "inline"}; filename="document.${ext}"`,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
