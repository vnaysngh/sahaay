import { z } from "zod";
import { getPool } from "@/db";
import { Attachments } from "@/media/attachments";
import { requireOrigin, requireUser, errorResponse } from "@/channels/web/http";
import { RequestError } from "@/core/validation";
export const runtime = "nodejs";
async function owned(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser(request);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success)
    throw new RequestError(400, "id", "Invalid attachment.");
  return { user, id, store: new Attachments(getPool()) };
}
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { user, id, store } = await owned(request, context);
    const { attachment, data } = await store.read(user.id, id);
    return new Response(new Uint8Array(data), {
      headers: {
        "Content-Type": attachment.mime,
        "Content-Disposition": "inline",
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    requireOrigin(request);
    const { user, id, store } = await owned(request, context);
    await store.remove(user.id, id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return errorResponse(error);
  }
}
