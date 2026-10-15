import { authorizeInput } from "@sahaay/api-client";
import { getPool } from "@/db";
import { GoogleConnections, googleConfiguration } from "@/google/connections";
import {
  requireUser,
  requireOrigin,
  requireProcessing,
  readBody,
  errorResponse,
} from "@/channels/web/http";
import { RequestError } from "@/core/validation";
export const runtime = "nodejs";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser(request);
    await requireProcessing(user.id);
    const input = authorizeInput.safeParse(await readBody(request));
    if (!input.success)
      throw new RequestError(
        400,
        "input",
        "Choose Google permissions and platform.",
      );
    if (
      input.data.platform === "web" &&
      request.headers.get("origin") !== googleConfiguration().base
    )
      throw new RequestError(
        400,
        "google_origin",
        "Open Sahaay using its configured canonical address before connecting Google.",
      );
    return Response.json(
      await new GoogleConnections(getPool()).authorize(user.id, input.data),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
