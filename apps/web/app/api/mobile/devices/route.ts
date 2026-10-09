import { z } from "zod";
import { getPool } from "@/db";
import { MobileDevices, deviceInput } from "@/channels/mobile/devices";
import {
  requireUser,
  requireOrigin,
  readBody,
  errorResponse,
} from "@/channels/web/http";
import { RequestError } from "@/core/validation";
export const runtime = "nodejs";
function store() {
  return new MobileDevices(getPool(), process.env.SAHAAY_EXPO_PROJECT_ID);
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser(request),
      input = deviceInput.safeParse(await readBody(request));
    if (!input.success)
      throw new RequestError(400, "device", "Invalid notification device.");
    return Response.json(await store().register(user.id, input.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function DELETE(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser(request),
      input = z
        .object({ installationId: z.string().uuid() })
        .strict()
        .safeParse(await readBody(request));
    if (!input.success)
      throw new RequestError(400, "device", "Invalid device.");
    await store().remove(user.id, input.data.installationId);
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function GET(request: Request) {
  try {
    const user = await requireUser(request),
      id = z
        .string()
        .uuid()
        .safeParse(new URL(request.url).searchParams.get("installationId"));
    if (!id.success) throw new RequestError(400, "device", "Invalid device.");
    return Response.json(await store().status(user.id, id.data), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
