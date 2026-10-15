import { z } from "zod";
import { getPool } from "@/db";
import { GoogleConnections } from "@/google/connections";
import {
  requireUser,
  requireOrigin,
  readBody,
  errorResponse,
  requireProcessing,
} from "@/channels/web/http";
import { RequestError } from "@/core/validation";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser(request);
    await requireProcessing(user.id);
    const input = z
      .object({
        transactionId: z.string().regex(/^[a-f0-9]{64}$/),
        reference: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
      })
      .strict()
      .safeParse(await readBody(request));
    if (!input.success)
      throw new RequestError(
        400,
        "google_completion",
        "Invalid connection completion.",
      );
    return Response.json(
      await new GoogleConnections(getPool()).complete(
        user.id,
        input.data.transactionId,
        input.data.reference,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
