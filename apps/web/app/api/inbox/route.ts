import { z } from "zod";
import { getPool } from "@/db";
import { PostgresFollowups } from "@/db/followups";
import { resolveLocalTime } from "@/core/followups";
import { recordBehavior } from "@/db/events";
import {
  requireUser,
  requireOrigin,
  readBody,
  errorResponse,
  requireProcessing,
} from "@/channels/web/http";
import { RequestError } from "@/core/validation";
export const runtime = "nodejs";
const input = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("timezone"),
      timezone: z.string().min(1).max(80),
    })
    .strict(),
  z
    .object({
      action: z.enum(["open", "done", "dismiss", "cancel", "reschedule"]),
      id: z.string().uuid(),
      version: z.number().int().positive(),
      confirmed: z.boolean().optional(),
      localTime: z.string().max(16).optional(),
      timezone: z.string().max(80).optional(),
    })
    .strict(),
]);
export async function GET(request: Request) {
  try {
    const user = await requireUser(request);
    await recordBehavior(
      getPool(),
      user.id,
      crypto.randomUUID(),
      "inbox_viewed",
    );
    return Response.json(
      await new PostgresFollowups(getPool()).context(user.id),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser(request),
      store = new PostgresFollowups(getPool());
    const parsed = input.safeParse(await readBody(request));
    if (!parsed.success)
      throw new RequestError(400, "input", "Choose a valid Inbox action.");
    const a = parsed.data;
    if (a.action === "timezone") {
      await requireProcessing(user.id);
      await store.configureTimezone(user.id, a.timezone);
      return Response.json({ ok: true });
    }
    let schedule;
    if (a.action === "reschedule") {
      if (!a.localTime || !a.timezone)
        throw new RequestError(
          400,
          "schedule",
          "Choose a date, time and timezone.",
        );
      const old = (await store.list(user.id)).find((r) => r.id === a.id);
      if (!old) throw new RequestError(404, "followup", "Follow-up not found.");
      schedule = {
        reason: old.reason,
        relatedItemId: old.relatedItemId,
        localTime: a.localTime,
        timezone: a.timezone,
        scheduledFor: resolveLocalTime(a.localTime, a.timezone),
      };
    }
    return Response.json(
      await store.webChange(
        user.id,
        a.id,
        a.version,
        a.action,
        schedule,
        a.confirmed === true,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
