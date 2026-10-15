import { z } from "zod";
import { getPool } from "@/db";
import {
  GoogleConnections,
  mobileGoogleLinksConfigured,
} from "@/google/connections";
import {
  requireUser,
  requireOrigin,
  readBody,
  errorResponse,
} from "@/channels/web/http";
import { RequestError } from "@/core/validation";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    return Response.json(
      {
        configured: Boolean(
          process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET,
        ),
        mobileLinksConfigured: mobileGoogleLinksConfigured(),
        connections: await new GoogleConnections(getPool()).list(user.id),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser(request);
    const input = z
      .object({ connectionId: z.string().uuid() })
      .strict()
      .safeParse(await readBody(request));
    if (!input.success)
      throw new RequestError(400, "input", "Choose a Google account.");
    const result = await new GoogleConnections(getPool()).disconnect(
      user.id,
      input.data.connectionId,
    );
    return Response.json({ ok: true, ...result });
  } catch (e) {
    return errorResponse(e);
  }
}
