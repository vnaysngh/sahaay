import type { Pool } from "pg";
import { MediaFiles } from "./files";
import { validateMedia } from "./validate";
import { RequestError } from "../core/validation";
import type { Transcript } from "../providers/transcription";
export type Attachment = {
  id: string;
  kind: "image" | "audio";
  filename: string;
  mime: string;
  bytes: number;
  width: number | null;
  height: number | null;
  duration: number | null;
  transcript: string | null;
  expiresAt: string;
  metadata: Transcript["metadata"] | null;
  available: boolean;
};
export class Attachments {
  constructor(
    readonly pool: Pool,
    readonly files = new MediaFiles(),
  ) {}
  async upload(userId: string, data: Buffer, filename: string) {
    const result = await validateMedia(data, this.files.root);
    const id = crypto.randomUUID();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended($1,1))",
        [userId],
      );
      const count = await client.query(
        "SELECT count(*)::int AS count FROM attachments WHERE user_id=$1 AND created_at>now()-interval '1 hour'",
        [userId],
      );
      if (count.rows[0].count >= 30)
        throw new RequestError(
          429,
          "quota",
          "You’ve reached the upload limit. Try again in an hour.",
        );
      await this.files.put(id, result.data);
      await client.query(
        "INSERT INTO attachments(id,user_id,kind,filename,mime,bytes,width,height,duration) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          id,
          userId,
          result.kind,
          filename.slice(0, 100),
          result.mime,
          result.data.length,
          result.width ?? null,
          result.height ?? null,
          result.duration ?? null,
        ],
      );
      await client.query("COMMIT");
      return {
        id,
        kind: result.kind,
        filename: filename.slice(0, 100),
        mime: result.mime,
        width: result.width ?? null,
        height: result.height ?? null,
        duration: result.duration ?? null,
        bytes: result.data.length,
        transcript: null,
        metadata: null,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        available: true,
      };
    } catch (error) {
      await client.query("ROLLBACK");
      await this.files.remove(id);
      throw error;
    } finally {
      client.release();
    }
  }
  async get(userId: string, id: string): Promise<Attachment> {
    const row = (
      await this.pool.query(
        `SELECT id,kind,filename,mime,bytes,width,height,duration,transcript,expires_at AS "expiresAt",provider_metadata AS metadata, expires_at>now() AS available FROM attachments WHERE id=$1 AND user_id=$2`,
        [id, userId],
      )
    ).rows[0];
    if (!row) throw new RequestError(404, "not_found", "Attachment not found.");
    return row;
  }
  async read(userId: string, id: string) {
    const attachment = await this.get(userId, id);
    if (!attachment.available)
      throw new RequestError(
        410,
        "expired",
        "This attachment has expired. Please upload it again.",
      );
    try {
      return { attachment, data: await this.files.read(id) };
    } catch {
      throw new RequestError(
        410,
        "expired",
        "This attachment is no longer available. Please upload it again.",
      );
    }
  }
  async saveTranscript(userId: string, id: string, result: Transcript) {
    await this.pool.query(
      "UPDATE attachments SET transcript=$3,provider_metadata=$4 WHERE id=$1 AND user_id=$2",
      [id, userId, result.text, JSON.stringify(result.metadata)],
    );
  }
  async remove(userId: string, id: string) {
    const result = await this.pool.query(
      "DELETE FROM attachments WHERE id=$1 AND user_id=$2 AND message_id IS NULL RETURNING id",
      [id, userId],
    );
    if (!result.rowCount)
      throw new RequestError(404, "not_found", "Pending attachment not found.");
    await this.files.remove(id);
  }
  async cleanup() {
    const expired = await this.pool.query(
      "SELECT id FROM attachments WHERE expires_at<=now()",
    );
    for (const row of expired.rows) await this.files.remove(row.id);
    await this.pool.query(
      "DELETE FROM attachments WHERE message_id IS NULL AND expires_at<=now()",
    );
    const active = new Set<string>(
      (
        await this.pool.query(
          "SELECT id FROM attachments WHERE expires_at>now()",
        )
      ).rows.map((r) => r.id),
    );
    await this.files.cleanup(active);
  }
}
