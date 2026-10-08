import { timingSafeEqual } from "node:crypto";
import { getPool } from "@/db";
import { getConfig } from "@/config";
import { readBody, errorResponse } from "@/channels/web/http";
import { TelegramAdapter } from "@/channels/telegram/adapter";
import { TelegramApi } from "@/channels/telegram/api";
import { updateSchema } from "@/channels/telegram/input";
export const runtime = "nodejs";
export const maxDuration = 360;
// Authenticated local polling bridge, NOT a public Telegram webhook.
export async function POST(request: Request) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token)
    return Response.json(
      { error: "Telegram is not configured" },
      { status: 503 },
    );
  const expected = Buffer.from(`Bearer ${token}`),
    actual = Buffer.from(request.headers.get("authorization") ?? "");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const parsed = updateSchema.safeParse(await readBody(request));
    if (!parsed.success)
      return Response.json(
        { error: "Unsupported Telegram update" },
        { status: 400 },
      );
    await new TelegramAdapter(
      getPool(),
      new TelegramApi(token),
      token.split(":")[0],
      new URL(getConfig().BETTER_AUTH_URL).origin,
    ).handle(parsed.data);
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
