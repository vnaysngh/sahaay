import "../../scripts/env";
import { readFile, readdir } from "node:fs/promises";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { accountProfile } from "../../apps/web/src/db/profile";
import { MobileDevices } from "../../apps/web/src/channels/mobile/devices";
import {
  MobilePushDelivery,
  type PushTransport,
} from "../../apps/web/src/channels/mobile/push";
import { FollowupWorker } from "../../apps/web/src/core/followup-worker";
const schema = "mobile_" + crypto.randomUUID().replaceAll("-", "");
const projectId = crypto.randomUUID(),
  installationId = crypto.randomUUID();
let pool: Pool, admin: Pool, devices: MobileDevices;
const input = {
  installationId,
  token: "ExpoPushToken[synthetic_device_token]",
  projectId,
  platform: "ios" as const,
  enabled: true,
};
beforeAll(async () => {
  admin = new Pool({ connectionString: process.env.DATABASE_URL });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    options: `-c search_path=${schema},public`,
  });
  for (const f of (await readdir("apps/web/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await pool.query(await readFile("apps/web/migrations/" + f, "utf8"));
  await pool.query(
    `INSERT INTO "user"(id,name,email,email_verified) VALUES('alice','Alice','mobile-alice@example.invalid',true),('bob','Bob','mobile-bob@example.invalid',true)`,
  );
  devices = new MobileDevices(pool, projectId);
});
beforeEach(async () => {
  await pool.query("DELETE FROM followups");
  await pool.query("DELETE FROM mobile_devices");
  await pool.query(
    'UPDATE "user" SET processing_paused=false,email_verified=true',
  );
});
afterAll(async () => {
  await pool?.end();
  await admin?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin?.end();
});
async function reminder() {
  return (
    await pool.query(
      `INSERT INTO followups(user_id,reason,scheduled_for,timezone,source_id,conversation_id) VALUES('alice','synthetic reminder',now()-interval '1 minute','Asia/Kolkata',gen_random_uuid(),gen_random_uuid()) RETURNING id`,
    )
  ).rows[0].id as string;
}
function transport(
  status: "accepted" | "unknown" | "invalid" | "retry" = "accepted",
) {
  let calls = 0;
  const value: PushTransport = {
    send: async () => {
      calls++;
      return status === "accepted"
        ? { status, ticketId: "ticket-" + calls }
        : { status };
    },
    receipts: async () => ({}),
  };
  return { value, count: () => calls };
}
it("isolates registration/status/removal and rotates a token without creating a second device", async () => {
  await devices.register("alice", input);
  expect(await devices.status("bob", installationId)).toEqual({
    enabled: false,
    configured: true,
  });
  await devices.remove("bob", installationId);
  expect((await devices.status("alice", installationId)).enabled).toBe(true);
  await devices.register("alice", {
    ...input,
    token: "ExpoPushToken[rotated_token]",
  });
  expect((await pool.query("SELECT * FROM mobile_devices")).rows).toHaveLength(
    1,
  );
  await devices.remove("alice", installationId);
  expect((await devices.status("alice", installationId)).enabled).toBe(false);
});
it("rejects foreign project IDs and paused registrations", async () => {
  await expect(
    devices.register("alice", { ...input, projectId: crypto.randomUUID() }),
  ).rejects.toMatchObject({ status: 503 });
  await pool.query(`UPDATE "user" SET processing_paused=true WHERE id='alice'`);
  await expect(devices.register("alice", input)).rejects.toMatchObject({
    status: 403,
  });
});
it("reuses M7 readiness and prevents duplicate sends across concurrent workers/repeated ticks", async () => {
  await devices.register("alice", input);
  const id = await reminder();
  await new FollowupWorker(pool, null, true).tick();
  const t = transport(),
    a = new MobilePushDelivery(pool, t.value, true),
    b = new MobilePushDelivery(pool, t.value, true);
  await Promise.all([a.tick(), b.tick()]);
  await a.tick();
  expect(t.count()).toBe(1);
  expect(
    (await pool.query("SELECT status FROM followups WHERE id=$1", [id])).rows[0]
      .status,
  ).toBe("ready");
  expect(
    (await pool.query("SELECT status FROM mobile_push_deliveries")).rows[0]
      .status,
  ).toBe("accepted");
});
it("does not blindly replay uncertain sends and invalidates rejected device tokens", async () => {
  await devices.register("alice", input);
  await reminder();
  await new FollowupWorker(pool, null, true).tick();
  const t = transport("unknown"),
    w = new MobilePushDelivery(pool, t.value, true);
  await w.tick();
  await w.tick();
  expect(t.count()).toBe(1);
  expect(
    (await pool.query("SELECT status FROM mobile_push_deliveries")).rows[0]
      .status,
  ).toBe("unknown");
  await pool.query("DELETE FROM followups");
  await reminder();
  await new FollowupWorker(pool, null, true).tick();
  await new MobilePushDelivery(pool, transport("invalid").value, true).tick();
  expect((await devices.status("alice", installationId)).enabled).toBe(false);
});
it("suppresses cancelled/paused reminders and supports two devices without leaking to another user", async () => {
  await devices.register("alice", input);
  await devices.register("alice", {
    ...input,
    installationId: crypto.randomUUID(),
    token: "ExpoPushToken[second_token]",
    platform: "android",
  });
  await devices.register("bob", {
    ...input,
    token: "ExpoPushToken[bob_token]",
  });
  const id = await reminder();
  await new FollowupWorker(pool, null, true).tick();
  await pool.query(`UPDATE "user" SET processing_paused=true WHERE id='alice'`);
  const t = transport(),
    w = new MobilePushDelivery(pool, t.value, true);
  await w.tick();
  expect(t.count()).toBe(0);
  await pool.query(
    `UPDATE "user" SET processing_paused=false WHERE id='alice'`,
  );
  await w.tick();
  expect(t.count()).toBe(2);
  await pool.query(
    `UPDATE followups SET status='cancelled',version=version+1 WHERE id=$1`,
    [id],
  );
  await w.tick();
  expect(t.count()).toBe(2);
});
it("does not notify a newly registered device about historical ready reminders", async () => {
  await reminder();
  await new FollowupWorker(pool, null, true).tick();
  await devices.register("alice", input);
  const t = transport();
  await new MobilePushDelivery(pool, t.value, true).tick();
  expect(t.count()).toBe(0);
});
it("enforces notification relationship ownership in PostgreSQL", async () => {
  await devices.register("bob", input);
  const id = await reminder();
  const device = (
    await pool.query(
      "SELECT id,revision FROM mobile_devices WHERE user_id='bob'",
    )
  ).rows[0];
  await expect(
    pool.query(
      "INSERT INTO mobile_push_deliveries(user_id,followup_id,followup_version,device_id,device_revision) VALUES('bob',$1,1,$2,$3)",
      [id, device.id, device.revision],
    ),
  ).rejects.toMatchObject({ code: "23503" });
});
it("checks provider receipts and never disables a newly rotated token from an old receipt", async () => {
  await devices.register("alice", input);
  await reminder();
  await new FollowupWorker(pool, null, true).tick();
  const t = transport();
  t.value.receipts = async (ids) =>
    Object.fromEntries(ids.map((id) => [id, "invalid" as const]));
  const w = new MobilePushDelivery(pool, t.value, true);
  await w.tick();
  await devices.register("alice", {
    ...input,
    token: "ExpoPushToken[new_token_after_send]",
  });
  await pool.query(
    "UPDATE mobile_push_deliveries SET accepted_at=now()-interval '16 minutes'",
  );
  await w.tick();
  expect((await devices.status("alice", installationId)).enabled).toBe(true);
  expect(
    (await pool.query("SELECT status FROM mobile_push_deliveries")).rows[0]
      .status,
  ).toBe("failed");
  expect(t.count()).toBe(1);
});
it("does not send an already-cancelled due reminder", async () => {
  await devices.register("alice", input);
  const id = await reminder();
  await new FollowupWorker(pool, null, true).tick();
  await pool.query(
    "UPDATE followups SET status='cancelled',version=version+1 WHERE id=$1",
    [id],
  );
  const t = transport();
  await new MobilePushDelivery(pool, t.value, true).tick();
  expect(t.count()).toBe(0);
});
it("preserves send evidence for old ready reminders instead of replaying after retention cleanup", async () => {
  await devices.register("alice", input);
  await reminder();
  await new FollowupWorker(pool, null, true).tick();
  const t = transport("unknown"),
    w = new MobilePushDelivery(pool, t.value, true);
  await w.tick();
  await pool.query(
    "UPDATE mobile_push_deliveries SET updated_at=now()-interval '31 days'",
  );
  await w.tick();
  await w.tick();
  expect(t.count()).toBe(1);
});

it("account profile resolves the canonical user without crossing ownership", async () => {
  expect(await accountProfile(pool, "alice")).toEqual({ displayName: "Alice" });
  expect(await accountProfile(pool, "bob")).toEqual({ displayName: "Bob" });
  expect(await accountProfile(pool, "unknown")).toEqual({ displayName: null });
  expect(await accountProfile(pool, "alice' OR '1'='1")).toEqual({
    displayName: null,
  });
});
