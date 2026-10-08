import type { Pool } from "pg";
import type { Evidence } from "./journal";
import { evidenceSchema } from "./journal";
export async function suppressDeletedData(pool: Pool, entries: Evidence[]) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const hasFollowups = Boolean(
      (
        await client.query(
          "SELECT 1 FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='followups'",
        )
      ).rowCount,
    );
    for (const raw of entries) {
      const e = evidenceSchema.parse(raw);
      if (Date.parse(e.expiresAt) <= Date.now()) continue;
      if (e.kind === "account") {
        await client.query('DELETE FROM "user" WHERE id=$1', [e.userId]);
        continue;
      }
      if (e.kind === "pause") {
        await client.query(
          'UPDATE "user" SET processing_paused=$2 WHERE id=$1',
          [e.userId, e.paused ?? true],
        );
        continue;
      }
      if (e.kind === "conversation") {
        await client.query(
          "DELETE FROM conversations WHERE user_id=$1 AND id=ANY($2::uuid[])",
          [e.userId, e.ids],
        );
        continue;
      }
      if (e.kind === "artifact") {
        if (
          (
            await client.query(
              "SELECT 1 FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='artifacts'",
            )
          ).rowCount
        ) {
          await client.query(
            "DELETE FROM artifacts WHERE user_id=$1 AND id=ANY($2::uuid[])",
            [e.userId, e.ids],
          );
          await client.query(
            "DELETE FROM attachments WHERE user_id=$1 AND (id=ANY($2::uuid[]) OR message_id=ANY($2::uuid[]))",
            [e.userId, e.sourceIds],
          );
          await client.query(
            "DELETE FROM messages WHERE user_id=$1 AND request_id IN (SELECT request_id FROM messages WHERE user_id=$1 AND (id=ANY($2::uuid[]) OR context_record_source_ids && $2::uuid[]))",
            [e.userId, e.sourceIds],
          );
        }
        continue;
      }
      if (e.kind === "followup") {
        if (!hasFollowups) continue;
        await client.query(
          "DELETE FROM followups WHERE user_id=$1 AND id=ANY($2::uuid[]) AND ($3::int IS NULL OR version<$3)",
          [e.userId, e.ids, e.keepVersion ?? null],
        );
        continue;
      }
      if (e.kind === "memory") {
        await client.query(
          "UPDATE memories SET supersedes_id=NULL WHERE user_id=$1 AND supersedes_id=ANY($2::uuid[])",
          [e.userId, e.ids],
        );
        await client.query(
          "DELETE FROM memories WHERE user_id=$1 AND id=ANY($2::uuid[])",
          [e.userId, e.ids],
        );
      } else
        await client.query(
          "DELETE FROM saved_items WHERE user_id=$1 AND id=ANY($2::uuid[]) AND ($3::int IS NULL OR version<$3)",
          [e.userId, e.ids, e.keepVersion ?? null],
        );
      // Remove restored copies in source turns and in answers that consumed those records.
      await client.query(
        `DELETE FROM messages WHERE user_id=$1 AND request_id IN (SELECT request_id FROM messages WHERE user_id=$1 AND (id=ANY($2::uuid[]) OR context_record_source_ids && $2::uuid[]))`,
        [e.userId, e.sourceIds],
      );
    }
    if (
      (
        await client.query(
          "SELECT 1 FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='followups'",
        )
      ).rowCount
    ) {
      const audited = Boolean(
        (
          await client.query(
            "SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='followups' AND column_name='lifecycle_source'",
          )
        ).rowCount,
      );
      // Never replay notifications from a restored snapshot. Re-establish consent in Inbox.
      await client.query(
        `UPDATE followups SET status='cancelled',cancelled_at=now(),delivery_status=CASE WHEN delivery_status='sending' THEN 'unknown' ELSE delivery_status END,version=version+1,updated_at=now()${audited ? ",lifecycle_source='backup_restore',lifecycle_changed_at=now()" : ""} WHERE status IN ('scheduled','ready')`,
      );
    }
    // Channel access must be freshly linked after restoring an older identity snapshot.
    if (
      (
        await client.query(
          "SELECT 1 FROM information_schema.tables WHERE table_schema=current_schema() AND table_name='telegram_links'",
        )
      ).rowCount
    ) {
      await client.query("DELETE FROM telegram_links");
      await client.query("DELETE FROM telegram_link_codes");
      await client.query("DELETE FROM telegram_updates");
    }
    await client.query("DELETE FROM session");
    await client.query("DELETE FROM verification");
    // Restoring an older snapshot must not revive an old/compromised password.
    await client.query(
      "UPDATE account SET password=NULL WHERE provider_id='credential'",
    );
    await client.query(
      "DELETE FROM messages WHERE created_at<now()-interval '7 days'",
    );
    await client.query(
      "DELETE FROM conversations c WHERE c.created_at<now()-interval '7 days' AND NOT EXISTS(SELECT 1 FROM messages m WHERE m.conversation_id=c.id)",
    );
    await client.query(
      "UPDATE conversations c SET title=COALESCE((SELECT left(content,70) FROM messages m WHERE m.conversation_id=c.id AND m.role='user' ORDER BY m.created_at LIMIT 1),'New conversation') WHERE c.created_at<now()-interval '7 days'",
    );
    await client.query(
      "DELETE FROM product_events WHERE created_at<now()-interval '30 days'",
    );
    await client.query("DELETE FROM record_mutations WHERE expires_at<now()");
    if (
      (
        await client.query(
          "SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='attachments' AND column_name='original_image'",
        )
      ).rowCount
    )
      await client.query(
        "UPDATE attachments SET original_image=NULL,original_mime=NULL,original_bytes=NULL",
      );
    // Raw media is excluded from backups; never claim restored attachment pixels exist.
    await client.query(
      "UPDATE attachments SET expires_at=LEAST(expires_at,now())",
    );
    await client.query(
      "UPDATE messages SET status='interrupted',error_code='interrupted' WHERE status='running'",
    );
    await client.query(
      "UPDATE product_events SET outcome='interrupted',error_class='interrupted' WHERE outcome='started'",
    );
    await client.query("DELETE FROM rate_limit");
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
