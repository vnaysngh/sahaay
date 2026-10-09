import { z } from "zod";
import type { Pool } from "pg";
import { RequestError } from "../../core/validation";
export const deviceInput = z
  .object({
    installationId: z.string().uuid(),
    token: z
      .string()
      .regex(/^(?:ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/)
      .max(256),
    projectId: z.string().uuid(),
    platform: z.enum(["ios", "android"]),
    enabled: z.boolean(),
  })
  .strict();
export class MobileDevices {
  constructor(
    private pool: Pool,
    private projectId: string | undefined,
  ) {}
  async register(owner: string, input: z.infer<typeof deviceInput>) {
    if (!this.projectId || input.projectId !== this.projectId)
      throw new RequestError(
        503,
        "push_configuration",
        "Mobile notifications are not configured yet.",
      );
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        owner,
      ]);
      if (
        !(
          await c.query(
            'SELECT 1 FROM "user" WHERE id=$1 AND NOT processing_paused',
            [owner],
          )
        ).rowCount
      )
        throw new RequestError(
          403,
          "paused",
          "Resume Sahaay before enabling notifications.",
        );
      // A token belongs to one installation/account at a time. Moving it revokes old delivery references.
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,1))", [
        input.token,
      ]);
      await c.query(
        "DELETE FROM mobile_devices WHERE expo_token=$1 AND (user_id<>$2 OR installation_id<>$3)",
        [input.token, owner, input.installationId],
      );
      const existing = await c.query(
        "SELECT 1 FROM mobile_devices WHERE user_id=$1 AND installation_id=$2",
        [owner, input.installationId],
      );
      const total = Number(
        (
          await c.query(
            "SELECT count(*) FROM mobile_devices WHERE user_id=$1",
            [owner],
          )
        ).rows[0].count,
      );
      if (!existing.rowCount && total >= 10)
        throw new RequestError(
          429,
          "device_limit",
          "Remove an old notification device before adding another.",
        );
      await c.query(
        `INSERT INTO mobile_devices(user_id,installation_id,expo_token,project_id,platform,enabled) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id,installation_id) DO UPDATE SET created_at=CASE WHEN NOT mobile_devices.enabled AND EXCLUDED.enabled THEN now() ELSE mobile_devices.created_at END,revision=CASE WHEN mobile_devices.expo_token<>EXCLUDED.expo_token THEN gen_random_uuid() ELSE mobile_devices.revision END,expo_token=EXCLUDED.expo_token,project_id=EXCLUDED.project_id,platform=EXCLUDED.platform,enabled=EXCLUDED.enabled,updated_at=now()`,
        [
          owner,
          input.installationId,
          input.token,
          input.projectId,
          input.platform,
          input.enabled,
        ],
      );
      await c.query("COMMIT");
      return { enabled: input.enabled };
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async remove(owner: string, installationId: string) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      await c.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        owner,
      ]);
      await c.query(
        "DELETE FROM mobile_devices WHERE user_id=$1 AND installation_id=$2",
        [owner, installationId],
      );
      await c.query("COMMIT");
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async status(owner: string, installationId: string) {
    const row = (
      await this.pool.query(
        "SELECT enabled FROM mobile_devices WHERE user_id=$1 AND installation_id=$2",
        [owner, installationId],
      )
    ).rows[0];
    return {
      enabled: row?.enabled ?? false,
      configured: Boolean(this.projectId),
    };
  }
}
