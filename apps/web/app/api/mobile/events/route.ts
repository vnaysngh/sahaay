import { z } from "zod";
import { getPool } from "@/db";
import { recordBehavior } from "@/db/events";
import {
  requireUser,
  requireOrigin,
  requireProcessing,
  readBody,
  errorResponse,
} from "@/channels/web/http";
import { RequestError } from "@/core/validation";
export const runtime = "nodejs";
const input = z
  .object({
    eventId: z.string().uuid(),
    event: z.enum([
      "mobile_app_opened",
      "mobile_login_completed",
      "mobile_chat_started",
      "mobile_message_sent",
      "mobile_share_received",
      "mobile_share_completed",
      "mobile_artifact_opened",
      "mobile_saved_item_opened",
      "mobile_followup_opened",
      "mobile_followup_completed",
    ]),
  })
  .strict();
// Coarse allowlisted events only: no private messages, names, files, locations or document IDs.
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const user = await requireUser(request),
      value = input.safeParse(await readBody(request));
    if (!value.success) throw new RequestError(400, "event", "Invalid event.");
    await requireProcessing(user.id);
    const pool = getPool(),
      c = await pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        user.id,
      ]);
      const count = Number(
        (
          await c.query(
            "SELECT count(*) FROM product_events WHERE user_id=$1 AND channel='mobile' AND created_at>now()-interval '1 minute'",
            [user.id],
          )
        ).rows[0].count,
      );
      if (count >= 60)
        throw new RequestError(429, "event_limit", "Try again later.");
      await recordBehavior(c, user.id, value.data.eventId, value.data.event);
      await c.query(
        "UPDATE product_events SET channel='mobile' WHERE user_id=$1 AND request_id=$2",
        [user.id, value.data.eventId],
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
    return new Response(null, { status: 204 });
  } catch (e) {
    return errorResponse(e);
  }
}
