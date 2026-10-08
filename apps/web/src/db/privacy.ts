import type { Pool } from "pg";
import { DeletionJournal } from "../privacy/journal";
import { MediaFiles } from "../media/files";
import { RequestError } from "../core/validation";
export class PostgresPrivacy {
  constructor(
    private pool: Pool,
    private journal = new DeletionJournal(),
    private files = new MediaFiles(),
  ) {}
  async summary(owner: string) {
    const row = (
      await this.pool.query(
        `SELECT processing_paused AS paused,(SELECT count(*)::int FROM conversations WHERE user_id=$1) AS conversations,(SELECT count(*)::int FROM memories WHERE user_id=$1 AND valid_until IS NULL) AS memories,(SELECT count(*)::int FROM saved_items WHERE user_id=$1 AND record_role='item') AS items,(SELECT count(*)::int FROM saved_items WHERE user_id=$1 AND record_role='object') AS objects FROM "user" WHERE id=$1`,
        [owner],
      )
    ).rows[0];
    if (!row) throw new RequestError(401, "unauthorized", "Please sign in.");
    return row;
  }
  async change(
    owner: string,
    action:
      | { target: "pause"; paused: boolean }
      | { target: "conversation"; id: string }
      | { target: "chats" }
      | { target: "account" },
  ) {
    const client = await this.pool.connect();
    let media: string[] = [];
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,0))",
        [owner],
      );
      if (
        !(
          await client.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [
            owner,
          ])
        ).rowCount
      )
        throw new RequestError(401, "unauthorized", "Please sign in.");
      if (action.target === "pause") {
        await this.journal.append({
          kind: "pause",
          userId: owner,
          ids: [],
          sourceIds: [],
          paused: action.paused,
        });
        await client.query(
          'UPDATE "user" SET processing_paused=$2 WHERE id=$1',
          [owner, action.paused],
        );
        if (action.paused)
          await client.query(
            "UPDATE messages SET status='interrupted',error_code='interrupted',completed_at=now() WHERE user_id=$1 AND status='running'",
            [owner],
          );
      } else {
        const convos =
          action.target === "conversation"
            ? (
                await client.query(
                  "SELECT id FROM conversations WHERE id=$1 AND user_id=$2",
                  [action.id, owner],
                )
              ).rows
            : (
                await client.query(
                  "SELECT id FROM conversations WHERE user_id=$1",
                  [owner],
                )
              ).rows;
        if (action.target === "conversation" && !convos.length)
          throw new RequestError(404, "not_found", "Conversation not found.");
        const ids = convos.map((c) => c.id);
        media = (
          await client.query(
            "SELECT id FROM attachments WHERE user_id=$1 AND ($2::boolean OR conversation_id=ANY($3::uuid[]))",
            [owner, action.target === "account", ids],
          )
        ).rows.map((a) => a.id);
        if (action.target === "account") {
          await this.journal.append({
            kind: "account",
            userId: owner,
            ids: [],
            sourceIds: [],
          });
          await client.query('DELETE FROM "user" WHERE id=$1', [owner]);
        } else {
          for (let i = 0; i < ids.length; i += 500)
            await this.journal.append({
              kind: "conversation",
              userId: owner,
              ids: ids.slice(i, i + 500),
              sourceIds: [],
            });
          await client.query(
            "DELETE FROM conversations WHERE user_id=$1 AND id=ANY($2::uuid[])",
            [owner, ids],
          );
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
    // Reads are already denied by SQL deletion; orphan cleanup retries physical removals.
    for (const id of media)
      try {
        await this.files.remove(id);
      } catch {
        console.error("Private file cleanup pending");
      }
  }
}
