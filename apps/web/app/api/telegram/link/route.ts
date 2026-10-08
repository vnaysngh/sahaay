import { getPool } from "@/db";
import { TelegramStore } from "@/channels/telegram/store";
import { requireUser, requireOrigin, errorResponse } from "@/channels/web/http";
import { cancelRuns } from "@/core/runs";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    const linked = Boolean(
      (
        await getPool().query(
          "SELECT user_id FROM telegram_links WHERE user_id=$1",
          [user.id],
        )
      ).rowCount,
    );
    return Response.json(
      { linked },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser(request);
    const username = process.env.TELEGRAM_BOT_USERNAME;
    if (
      !process.env.TELEGRAM_BOT_TOKEN ||
      !username ||
      !/^[a-zA-Z0-9_]{5,32}$/.test(username)
    )
      return Response.json(
        { error: "The Telegram bot is not configured yet." },
        { status: 503 },
      );
    const token = await new TelegramStore(getPool()).issue(user.id);
    return Response.json(
      { url: `https://t.me/${username}?start=${token}`, expiresIn: 600 },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser(request);
    const conversation = await new TelegramStore(getPool()).disconnect(user.id);
    if (conversation) cancelRuns(user.id, conversation);
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
