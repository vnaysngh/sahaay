import { getPool } from "@/db";
import { Attachments } from "@/media/attachments";
import { MAX_UPLOAD_BYTES } from "@/media/validate";
import {
  requireOrigin,
  requireUser,
  requireProcessing,
  errorResponse,
} from "@/channels/web/http";
import { RequestError } from "@/core/validation";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser(request);
    await requireProcessing(user.id);
    const length = Number(request.headers.get("content-length"));
    if (length > MAX_UPLOAD_BYTES)
      throw new RequestError(413, "size", "Files must be smaller than 8 MB.");
    const reader = request.body?.getReader();
    if (!reader) throw new RequestError(400, "empty", "Choose a file.");
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_UPLOAD_BYTES) {
        await reader.cancel();
        throw new RequestError(413, "size", "Files must be smaller than 8 MB.");
      }
      chunks.push(value);
    }
    let filename = "upload";
    try {
      filename = decodeURIComponent(
        request.headers.get("x-file-name") ?? "upload",
      )
        .replace(/[\/\\\x00-\x1f]/g, "_")
        .slice(0, 100);
    } catch {
      throw new RequestError(400, "filename", "Invalid file name.");
    }
    return Response.json(
      await new Attachments(getPool()).upload(
        user.id,
        Buffer.concat(chunks),
        filename,
      ),
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
