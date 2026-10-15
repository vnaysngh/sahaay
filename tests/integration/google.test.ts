import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Pool } from "pg";
import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { google } from "googleapis";
import { LoginTicket } from "google-auth-library";
import { GoogleConnections } from "../../apps/web/src/google/connections";
import { ActionApprovals } from "../../apps/web/src/core/approvals";
import { seal, unseal } from "../../apps/web/src/media/artifact-crypto";
import { identityScopes, scopes } from "../../apps/web/src/google/scopes";
import { suppressDeletedData } from "../../apps/web/src/privacy/restore";
import { CalendarService } from "../../apps/web/src/google/calendar";
import { GmailService } from "../../apps/web/src/google/gmail";
import { googleTools } from "../../apps/web/src/providers/google-tools";
import { RunContext } from "@openai/agents";
const schema = "google_" + crypto.randomUUID().replaceAll("-", "");
const testUrl = process.env.SAHAAY_TEST_DATABASE_URL;
if (!testUrl || !["127.0.0.1", "localhost"].includes(new URL(testUrl).hostname))
  throw new Error(
    "Google integration tests require an explicit isolated local SAHAAY_TEST_DATABASE_URL.",
  );
let pool: Pool,
  admin: Pool,
  connections: GoogleConnections,
  approvals: ActionApprovals;
let calendarWrites = 0,
  recurring = false;
let duringExchange: (() => Promise<void>) | undefined;
let refreshes = 0,
  sends = 0,
  failRefresh = false,
  failSend = false,
  granted = [...identityScopes, ...scopes.gmail_read],
  nonce = "",
  subject = "google-alice",
  omitRefresh = false;
const previous = {
  key: process.env.SAHAAY_ARTIFACT_KEY,
  client: process.env.GOOGLE_CLIENT_ID,
  secret: process.env.GOOGLE_CLIENT_SECRET,
  url: process.env.BETTER_AUTH_URL,
};
function client() {
  const auth = new google.auth.OAuth2(
    "synthetic-client",
    "synthetic-secret",
    "http://localhost:3000/api/connections/google/callback",
  );
  return Object.assign(auth, {
    getToken: async () => {
      if (duringExchange) await duringExchange();
      return {
        tokens: {
          access_token: "synthetic-access",
          ...(omitRefresh ? {} : { refresh_token: "synthetic-refresh" }),
          id_token: "synthetic-id",
          expiry_date: Date.now() + 3600000,
        },
      };
    },
    verifyIdToken: async () =>
      new LoginTicket("synthetic", {
        iss: "https://accounts.google.com",
        aud: "synthetic-client",
        sub: subject,
        email: subject + "@example.invalid",
        email_verified: true,
        name: "Synthetic account",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 3600,
        ...{ nonce },
      }),
    getTokenInfo: async () => ({ scopes: granted }),
    refreshAccessToken: async () => {
      refreshes++;
      if (failRefresh)
        throw { response: { status: 400, data: { error: "invalid_grant" } } };
      return {
        credentials: {
          access_token: "refreshed-access",
          expiry_date: Date.now() + 3600000,
        },
      };
    },
    revokeToken: async () => ({}),
    request: async (opts: {
      url?: string;
      method?: string;
      data?: unknown;
    }) => {
      if (String(opts.url).includes("/freeBusy"))
        return {
          data: {
            calendars: {
              primary: {
                busy: [
                  {
                    start: "2026-10-20T10:00:00Z",
                    end: "2026-10-20T10:30:00Z",
                  },
                ],
              },
            },
          },
        };
      if (
        String(opts.url).includes("/calendarList") &&
        !String(opts.url).includes("/calendarList/")
      )
        return {
          data: {
            items: [
              {
                id: "primary",
                summary: "Synthetic calendar",
                accessRole: "owner",
                timeZone: "Asia/Kolkata",
              },
            ],
            nextPageToken: "calendar-page-2",
          },
        };
      if (String(opts.url).endsWith("/messages"))
        return {
          data: {
            messages: [{ id: "message-1", threadId: "thread-1" }],
            nextPageToken: "gmail-page-2",
          },
        };
      if (String(opts.url).includes("/messages/message-1"))
        return {
          data: {
            id: "message-1",
            threadId: "thread-1",
            raw: Buffer.from(
              "From: sender@example.invalid\r\nMessage-ID: <original@example.invalid>\r\nSubject: Booking\r\n\r\nSynthetic flight confirmation",
            ).toString("base64url"),
          },
        };
      if (String(opts.url).includes("/threads/"))
        return { data: { id: "thread-1", messages: [{ id: "message-1" }] } };
      if (
        String(opts.url).includes("/events") &&
        ["POST", "PATCH", "DELETE"].includes(opts.method ?? "")
      ) {
        calendarWrites++;
        return { data: { id: "created-event" } };
      }
      if (String(opts.url).endsWith("/events"))
        return {
          data: {
            items: [
              {
                id: "event-1",
                summary: "Synthetic appointment",
                etag: '"etag-1"',
              },
            ],
            nextPageToken: "event-page-2",
          },
        };
      if (
        String(opts.url).includes("/send") ||
        String(opts.url).includes("/drafts")
      ) {
        sends++;
        if (failSend) throw { code: "ETIMEDOUT" };
        return { data: { id: "synthetic-google-result" } };
      }
      if (String(opts.url).includes("/calendarList/"))
        return { data: { accessRole: "owner" } };
      if (String(opts.url).includes("/events/"))
        return {
          data: {
            id: "event-1",
            etag: '"etag-1"',
            summary: "Synthetic appointment",
            start: { date: "2026-10-20" },
            end: { date: "2026-10-21" },
            ...(recurring ? { recurrence: ["RRULE:FREQ=WEEKLY"] } : {}),
          },
        };
      if (
        opts.method === "POST" ||
        opts.method === "PATCH" ||
        opts.method === "DELETE"
      )
        return { data: { id: "created-event" } };
      throw new Error("Unexpected synthetic Google API operation");
    },
  });
}
beforeAll(async () => {
  process.env.SAHAAY_ARTIFACT_KEY = Buffer.alloc(32, 9).toString("base64");
  process.env.GOOGLE_CLIENT_ID = "synthetic-client";
  process.env.GOOGLE_CLIENT_SECRET = "synthetic-secret";
  process.env.BETTER_AUTH_URL = "http://localhost:3000";
  admin = new Pool({ connectionString: testUrl });
  await admin.query(`CREATE SCHEMA "${schema}"`);
  pool = new Pool({
    connectionString: testUrl,
    options: `-c search_path=${schema},public`,
  });
  for (const name of (await readdir("apps/web/migrations"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await pool.query(await readFile("apps/web/migrations/" + name, "utf8"));
  await pool.query(
    `INSERT INTO "user"(id,name,email,email_verified) VALUES('alice','Alice','google-alice@example.invalid',true),('bob','Bob','google-bob@example.invalid',true)`,
  );
  connections = new GoogleConnections(pool, client);
  approvals = new ActionApprovals(pool, connections);
});
beforeEach(async () => {
  await pool.query("DELETE FROM google_connections");
  await pool.query("DELETE FROM google_oauth_transactions");
  await pool.query('UPDATE "user" SET processing_paused=false');
  refreshes = 0;
  duringExchange = undefined;
  calendarWrites = 0;
  recurring = false;
  sends = 0;
  failRefresh = false;
  failSend = false;
  omitRefresh = false;
  subject = "google-alice";
  granted = [...identityScopes, ...scopes.gmail_read];
});
afterAll(async () => {
  await pool?.end();
  await admin?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin?.end();
  for (const [key, value] of Object.entries({
    SAHAAY_ARTIFACT_KEY: previous.key,
    GOOGLE_CLIENT_ID: previous.client,
    GOOGLE_CLIENT_SECRET: previous.secret,
    BETTER_AUTH_URL: previous.url,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});
async function authorize(connectionId?: string) {
  const { url } = await connections.authorize("alice", {
    platform: "web",
    capabilities: ["gmail_read"],
    connectionId,
  });
  const parsed = new URL(url),
    state = parsed.searchParams.get("state")!;
  nonce = createHash("sha256").update(state).digest("hex");
  return { state, url: parsed };
}
async function owned(
  grants = [
    ...scopes.gmail_read,
    ...scopes.gmail_send,
    ...scopes.gmail_compose,
    ...scopes.calendar_read,
    ...scopes.calendar_write,
  ],
  expiry = Date.now() + 3600000,
) {
  const id = crypto.randomUUID();
  await pool.query(
    "INSERT INTO google_connections(id,user_id,google_subject,email,display_name,status,scopes) VALUES($1,'alice','google-alice','alice@example.invalid','Alice','connected',$2)",
    [id, grants],
  );
  await pool.query(
    "INSERT INTO google_credentials(connection_id,user_id,encrypted_tokens) VALUES($1,'alice',$2)",
    [
      id,
      await seal(
        Buffer.from(
          JSON.stringify({
            access_token: "synthetic-access",
            refresh_token: "synthetic-refresh",
            expiry_date: expiry,
          }),
        ),
        "alice",
        id,
        "google_tokens",
      ),
    ],
  );
  return id;
}
const message = {
  to: ["recipient@example.invalid"],
  cc: [],
  subject: "Synthetic subject",
  body: "Synthetic email body",
  replyMessageId: null,
};
it("binds PKCE, state and fixed callback; stores encrypted credentials and rejects replay", async () => {
  const { state, url } = await authorize();
  expect(url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(url.searchParams.get("redirect_uri")).toBe(
    "http://localhost:3000/api/connections/google/callback",
  );
  expect(
    await connections.callback(state, "synthetic-code", false, "alice"),
  ).toEqual({ platform: "web", success: true });
  await expect(
    connections.callback(state, "synthetic-code", false, "alice"),
  ).rejects.toMatchObject({ code: "google_state" });
  const row = (await pool.query("SELECT * FROM google_credentials")).rows[0];
  expect(row.encrypted_tokens.toString()).not.toContain("synthetic-refresh");
  expect(await connections.list("bob")).toEqual([]);
});
it("rejects invalid, expired, wrong-owner and cancelled OAuth attempts", async () => {
  await expect(
    connections.callback("invalid", "x", false, "alice"),
  ).rejects.toMatchObject({ code: "google_state" });
  const a = await authorize();
  await pool.query(
    "UPDATE google_oauth_transactions SET expires_at=now()-interval '1 minute'",
  );
  await expect(
    connections.callback(a.state, "x", false, "alice"),
  ).rejects.toMatchObject({ code: "google_state" });
  const b = await authorize();
  await expect(
    connections.callback(b.state, "x", false, "bob"),
  ).rejects.toMatchObject({ code: "google_state" });
  const c = await authorize();
  expect(
    (await connections.callback(c.state, null, true, "alice")).success,
  ).toBe(false);
  expect(await connections.list("alice")).toEqual([]);
});
it("enforces actual granted scopes and Google subject during upgrades", async () => {
  const a = await authorize();
  granted = [...identityScopes];
  await connections.callback(a.state, "x", false, "alice");
  const id = (await connections.list("alice"))[0].id;
  expect((await connections.list("alice"))[0].capabilities).toEqual([]);
  await expect(
    connections.credential("alice", id, scopes.gmail_read, async () => "no"),
  ).rejects.toMatchObject({ code: "google_permission_required" });
  const b = await authorize(id);
  expect(b.url.searchParams.get("login_hint")).toBe(
    "google-alice@example.invalid",
  );
  expect(b.url.searchParams.get("prompt")).toBe("consent");
  subject = "other-google-account";
  await expect(
    connections.callback(b.state, "x", false, "alice"),
  ).rejects.toMatchObject({ code: "google_account_changed" });
});
it("requests supported permissions together and accepts a Calendar-only consent choice", async () => {
  const started = await connections.authorize("alice", {
    platform: "web",
    capabilities: [
      "gmail_read",
      "gmail_compose",
      "gmail_send",
      "calendar_read",
      "calendar_write",
    ],
  });
  const url = new URL(started.url);
  const requested = url.searchParams.get("scope")!.split(" ");
  for (const scope of Object.values(scopes).flat())
    expect(requested).toContain(scope);
  const state = url.searchParams.get("state")!;
  nonce = createHash("sha256").update(state).digest("hex");
  granted = [...identityScopes, ...scopes.calendar_read];
  await connections.callback(state, "synthetic-code", false, "alice");
  const account = (await connections.list("alice"))[0];
  expect(account.capabilities).toEqual(["calendar_read"]);
  await expect(
    connections.credential(
      "alice",
      account.id,
      scopes.gmail_send,
      async () => "must not send",
    ),
  ).rejects.toMatchObject({ code: "google_permission_required" });
});
it("rejects unexpected scopes and supports multiple distinct stable Google subjects", async () => {
  const a = await authorize();
  granted = [...identityScopes, "https://www.googleapis.com/auth/drive"];
  await expect(
    connections.callback(a.state, "x", false, "alice"),
  ).rejects.toMatchObject({ code: "google_scopes" });
  granted = [...identityScopes, ...scopes.gmail_read];
  const b = await authorize();
  await connections.callback(b.state, "x", false, "alice");
  subject = "google-second";
  const c = await authorize();
  await connections.callback(c.state, "x", false, "alice");
  expect(await connections.list("alice")).toHaveLength(2);
});
it("accepts cumulative Gmail permissions when connecting Calendar without selecting a connection", async () => {
  const first = await authorize();
  await connections.callback(first.state, "x", false, "alice");
  const originalId = (await connections.list("alice"))[0].id;
  const { url } = await connections.authorize("alice", {
    platform: "web",
    capabilities: ["calendar_read"],
  });
  const state = new URL(url).searchParams.get("state")!;
  nonce = createHash("sha256").update(state).digest("hex");
  granted = [...identityScopes, ...scopes.gmail_read, ...scopes.calendar_read];
  await connections.callback(state, "x", false, "alice");
  const accounts = await connections.list("alice");
  expect(accounts).toHaveLength(1);
  expect(accounts[0].id).toBe(originalId);
  expect(accounts[0].capabilities).toEqual(["gmail_read", "calendar_read"]);
});
it("preserves refresh token when Google omits it on reauthorization", async () => {
  const a = await authorize();
  await connections.callback(a.state, "x", false, "alice");
  const id = (await connections.list("alice"))[0].id;
  omitRefresh = true;
  const b = await authorize(id);
  await connections.callback(b.state, "x", false, "alice");
  const blob = (
    await pool.query(
      "SELECT encrypted_tokens FROM google_credentials WHERE connection_id=$1",
      [id],
    )
  ).rows[0].encrypted_tokens;
  expect(
    JSON.parse((await unseal(blob, "alice", id, "google_tokens")).toString())
      .refresh_token,
  ).toBe("synthetic-refresh");
});
it("serializes concurrent refresh and rejects cross-user credential access", async () => {
  const id = await owned(undefined, Date.now() - 1);
  await Promise.all([
    connections.credential("alice", id, scopes.gmail_read, async () => "a"),
    connections.credential("alice", id, scopes.gmail_read, async () => "b"),
  ]);
  expect(refreshes).toBe(1);
  await expect(
    connections.credential("bob", id, [], async () => "no"),
  ).rejects.toMatchObject({ code: "google_connection" });
});
it("marks invalid_grant for reauthorization without blind retries", async () => {
  const id = await owned(undefined, Date.now() - 1);
  failRefresh = true;
  await expect(
    connections.credential("alice", id, [], async () => "no"),
  ).rejects.toMatchObject({ code: "google_reauthorization" });
  expect(refreshes).toBe(1);
  expect((await connections.list("alice"))[0].status).toBe(
    "reauthorization_required",
  );
});
it("never sends on proposal, denies foreign approvals, and serializes duplicate confirmations", async () => {
  const id = await owned();
  const a = await approvals.propose("alice", crypto.randomUUID(), {
    kind: "gmail_send",
    connectionId: id,
    message,
  });
  expect(sends).toBe(0);
  expect(
    (
      await approvals.propose("alice", crypto.randomUUID(), {
        kind: "gmail_send",
        connectionId: id,
        message,
      })
    ).id,
  ).toBe(a.id);
  await expect(approvals.decide("bob", a.id, "approve")).rejects.toMatchObject({
    code: "approval_state",
  });
  const results = await Promise.allSettled([
    approvals.decide("alice", a.id, "approve"),
    approvals.decide("alice", a.id, "approve"),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(sends).toBe(1);
  expect((await approvals.list("alice"))[0].status).toBe("succeeded");
});
it("does not replay an uncertain Gmail send, even through a newly proposed request", async () => {
  const id = await owned();
  const input = { kind: "gmail_send" as const, connectionId: id, message };
  const a = await approvals.propose("alice", crypto.randomUUID(), input);
  failSend = true;
  await expect(
    approvals.decide("alice", a.id, "approve"),
  ).rejects.toMatchObject({ code: "google_unavailable" });
  expect((await approvals.list("alice"))[0].status).toBe("unknown");
  expect(
    (await approvals.propose("alice", crypto.randomUUID(), input)).id,
  ).toBe(a.id);
  await expect(
    approvals.decide("alice", a.id, "approve"),
  ).rejects.toMatchObject({ code: "approval_state" });
  expect(sends).toBe(1);
});
it("expires approval and revalidates connection revision and pause", async () => {
  const id = await owned();
  const a = await approvals.propose("alice", crypto.randomUUID(), {
    kind: "gmail_draft",
    connectionId: id,
    message,
  });
  await pool.query(
    "UPDATE action_approvals SET expires_at=now()-interval '1 minute' WHERE id=$1",
    [a.id],
  );
  await expect(
    approvals.decide("alice", a.id, "approve"),
  ).rejects.toMatchObject({ code: "approval_state" });
  const b = await approvals.propose("alice", crypto.randomUUID(), {
    kind: "gmail_draft",
    connectionId: id,
    message: { ...message, body: "Different body" },
  });
  await pool.query(
    "UPDATE google_connections SET revision=gen_random_uuid() WHERE id=$1",
    [id],
  );
  await expect(
    approvals.decide("alice", b.id, "approve"),
  ).rejects.toMatchObject({ code: "approval_stale" });
  expect(sends).toBe(0);
  await pool.query(
    "UPDATE \"user\" SET processing_paused=true WHERE id='alice'",
  );
  await expect(
    connections.credential("alice", id, [], async () => "no"),
  ).rejects.toMatchObject({ code: "paused" });
});
it("disconnects even a revoked account, erases credentials and proposals, and isolates owners", async () => {
  const id = await owned();
  await approvals.propose("alice", crypto.randomUUID(), {
    kind: "gmail_draft",
    connectionId: id,
    message,
  });
  await expect(connections.disconnect("bob", id)).rejects.toMatchObject({
    code: "google_connection",
  });
  await pool.query(
    "UPDATE google_connections SET status='reauthorization_required' WHERE id=$1",
    [id],
  );
  await connections.disconnect("alice", id);
  expect(
    (await pool.query("SELECT count(*)::int n FROM google_credentials")).rows[0]
      .n,
  ).toBe(0);
  expect(await approvals.list("alice")).toEqual([]);
  expect(await connections.list("alice")).toEqual([]);
  expect(
    (await pool.query("SELECT id FROM google_connections WHERE id=$1", [id]))
      .rowCount,
  ).toBe(0);
  await expect(authorize(id)).rejects.toMatchObject({
    code: "google_connection",
  });
});
it("removes the Google profile even if provider revocation fails", async () => {
  const id = await owned();
  const unavailable = new GoogleConnections(pool, () =>
    Object.assign(client(), {
      revokeToken: async () => {
        throw new Error("Synthetic provider outage");
      },
    }),
  );
  expect(await unavailable.disconnect("alice", id)).toEqual({
    revocationConfirmed: false,
  });
  expect(
    (await pool.query("SELECT id FROM google_connections WHERE id=$1", [id]))
      .rowCount,
  ).toBe(0);
  expect(await connections.list("alice")).toEqual([]);
});
it("does not restore Google credentials or executable proposals from backups", async () => {
  const id = await owned();
  await approvals.propose("alice", crypto.randomUUID(), {
    kind: "gmail_send",
    connectionId: id,
    message,
  });
  await suppressDeletedData(pool, []);
  expect(
    (await pool.query("SELECT count(*)::int n FROM google_credentials")).rows[0]
      .n,
  ).toBe(0);
  expect(await approvals.list("alice")).toEqual([]);
  expect(await connections.list("alice")).toEqual([]);
});
it("shows approvals only in owned linked conversations and reuses one action across turns", async () => {
  const id = await owned();
  const first = crypto.randomUUID(),
    second = crypto.randomUUID(),
    foreign = crypto.randomUUID();
  const requestOne = crypto.randomUUID(),
    requestTwo = crypto.randomUUID();
  await pool.query(
    "INSERT INTO conversations(id,user_id) VALUES($1,'alice'),($2,'alice'),($3,'bob')",
    [first, second, foreign],
  );
  await pool.query(
    "INSERT INTO messages(conversation_id,user_id,request_id,role,content,status) VALUES($1,'alice',$2,'user','Synthetic request','complete'),($3,'alice',$4,'user','Repeated request','complete')",
    [first, requestOne, second, requestTwo],
  );
  const proposal = { kind: "gmail_send" as const, connectionId: id, message };
  const a = await approvals.propose("alice", requestOne, proposal);
  const b = await approvals.propose("alice", requestTwo, proposal);
  expect(a.id).toBe(b.id);
  expect((await approvals.list("alice", first)).map((a) => a.id)).toEqual([
    a.id,
  ]);
  expect((await approvals.list("alice", second)).map((a) => a.id)).toEqual([
    a.id,
  ]);
  expect(await approvals.list("bob", first)).toEqual([]);
  expect(await approvals.list("alice", foreign)).toEqual([]);
});

it("uses provider-side Gmail search/pagination, parses selected messages and reads threads", async () => {
  const gmail = new GmailService(client());
  const found = await gmail.search(
    "from:airindia.com after:2026/10/01",
    "previous-page",
  );
  expect(found.nextPageToken).toBe("gmail-page-2");
  expect(found.messages[0].id).toBe("message-1");
  expect((await gmail.get("message-1")).body).toContain("Synthetic flight");
  expect((await gmail.thread("thread-1")).messages).toHaveLength(1);
});
it("creates Gmail drafts and replies only after immutable approval", async () => {
  const id = await owned();
  const proposal = await approvals.propose("alice", crypto.randomUUID(), {
    kind: "gmail_draft",
    connectionId: id,
    message: { ...message, replyMessageId: "message-1" },
  });
  expect(sends).toBe(0);
  expect(await approvals.decide("alice", proposal.id, "approve")).toMatchObject(
    { outcome: "draft_created" },
  );
  expect(sends).toBe(1);
});
const event = {
  summary: "Synthetic meeting",
  description: "Private synthetic event",
  location: "Office",
  attendees: ["recipient@example.invalid"],
  start: {
    date: null,
    localDateTime: "2026-10-20T15:00",
    timeZone: "Asia/Kolkata",
  },
  end: {
    date: null,
    localDateTime: "2026-10-20T15:30",
    timeZone: "Asia/Kolkata",
  },
};
it("lists calendars, date-filtered events and free/busy through provider APIs", async () => {
  const calendar = new CalendarService(client());
  expect((await calendar.calendars()).nextPageToken).toBe("calendar-page-2");
  expect(
    (
      await calendar.list(
        "primary",
        "2026-10-20T00:00:00Z",
        "2026-10-21T00:00:00Z",
      )
    ).events,
  ).toHaveLength(1);
  expect(
    (
      await calendar.availability(
        ["primary"],
        "2026-10-20T00:00:00Z",
        "2026-10-21T00:00:00Z",
        "Asia/Kolkata",
      )
    ).calendars?.primary.busy,
  ).toHaveLength(1);
});
it("requires approval for calendar creation, updates and deletion with provider previews", async () => {
  const id = await owned();
  const created = await approvals.propose("alice", crypto.randomUUID(), {
    kind: "calendar_create",
    connectionId: id,
    calendarId: "primary",
    event,
  });
  expect(calendarWrites).toBe(0);
  await approvals.decide("alice", created.id, "approve");
  expect(calendarWrites).toBe(1);
  const updated = await approvals.propose("alice", crypto.randomUUID(), {
    kind: "calendar_update",
    connectionId: id,
    calendarId: "primary",
    eventId: "event-1",
    etag: '"etag-1"',
    recurrenceScope: "occurrence",
    event,
  });
  expect(updated.preview?.event).toBe("Synthetic appointment");
  await approvals.decide("alice", updated.id, "approve");
  expect(calendarWrites).toBe(2);
  const deleted = await approvals.propose("alice", crypto.randomUUID(), {
    kind: "calendar_delete",
    connectionId: id,
    calendarId: "primary",
    eventId: "event-1",
    etag: '"etag-1"',
    recurrenceScope: "occurrence",
  });
  expect(calendarWrites).toBe(2);
  await approvals.decide("alice", deleted.id, "approve");
  expect(calendarWrites).toBe(3);
});
it("rejects stale events and does not silently apply an occurrence action to a series", async () => {
  const id = await owned();
  await expect(
    approvals.propose("alice", crypto.randomUUID(), {
      kind: "calendar_delete",
      connectionId: id,
      calendarId: "primary",
      eventId: "event-1",
      etag: '"wrong"',
      recurrenceScope: "series",
    }),
  ).rejects.toMatchObject({ code: "google_stale" });
  recurring = true;
  const action = await approvals.propose("alice", crypto.randomUUID(), {
    kind: "calendar_delete",
    connectionId: id,
    calendarId: "primary",
    eventId: "event-1",
    etag: '"etag-1"',
    recurrenceScope: "occurrence",
  });
  await expect(
    approvals.decide("alice", action.id, "approve"),
  ).rejects.toMatchObject({ code: "calendar_recurrence" });
  expect(calendarWrites).toBe(0);
});
it("the existing agent tools refuse ambiguous account selection and expose no execution/confirmation tool", async () => {
  const id = await owned();
  await pool.query(
    "INSERT INTO google_connections(user_id,google_subject,email,display_name,status,scopes) VALUES('alice','google-second','second@example.invalid','Second','connected',$1)",
    [scopes.gmail_read],
  );
  let privateAccess = false;
  const tools = googleTools(
    { google: connections, approvals },
    {
      userId: "alice",
      conversationId: crypto.randomUUID(),
      requestId: crypto.randomUUID(),
      messageId: crypto.randomUUID(),
      inputs: [{ type: "text", text: "Find my latest booking" }],
      receivedAt: new Date().toISOString(),
      channel: "web",
    },
    () => {
      privateAccess = true;
    },
    "Find my latest booking",
  );
  expect(tools.map((t) => t.name)).not.toContain("execute_google_action");
  expect(tools.map((t) => t.name)).not.toContain("confirm_action");
  const context = new RunContext();
  await tools
    .find((t) => t.name === "list_google_accounts")!
    .invoke(context, "{}");
  const response = await tools
    .find((t) => t.name === "gmail_search")!
    .invoke(
      context,
      JSON.stringify({ connectionId: id, query: "booking", pageToken: null }),
    );
  expect(JSON.stringify(response)).toContain("google_account_ambiguous");
  expect(privateAccess).toBe(true);
  expect(sends).toBe(0);
});
it("audit events contain no private proposal or token contents", async () => {
  const id = await owned();
  const action = await approvals.propose("alice", crypto.randomUUID(), {
    kind: "gmail_send",
    connectionId: id,
    message,
  });
  await approvals.decide("alice", action.id, "approve");
  const events = JSON.stringify(
    (await pool.query("SELECT * FROM product_events")).rows,
  );
  expect(events).not.toContain(message.body);
  expect(events).not.toContain(message.to[0]);
  expect(events).not.toContain("synthetic-refresh");
});
it("does not resurrect a disconnected account when an older OAuth exchange completes later", async () => {
  const id = await owned();
  const { state } = await authorize();
  duringExchange = () =>
    connections.disconnect("alice", id).then(() => undefined);
  await expect(
    connections.callback(state, "synthetic-code", false, "alice"),
  ).rejects.toMatchObject({ code: "google_account_changed" });
  expect(await connections.list("alice")).toEqual([]);
  expect(
    (await pool.query("SELECT count(*)::int AS n FROM google_credentials"))
      .rows[0].n,
  ).toBe(0);
});

it("holds native grants provisionally until the authenticated initiating app redeems its one-time reference", async () => {
  const savedUrl = process.env.BETTER_AUTH_URL,
    savedAppId = process.env.GOOGLE_MOBILE_APP_ID;
  process.env.BETTER_AUTH_URL = "https://sahaay.example.invalid";
  process.env.GOOGLE_MOBILE_APP_ID = "ABCDE12345.com.sahaay.app";
  try {
    const started = await connections.authorize("alice", {
      platform: "mobile",
      capabilities: ["gmail_read"],
    });
    const state = new URL(started.url).searchParams.get("state")!;
    nonce = createHash("sha256").update(state).digest("hex");
    const callback = await connections.callback(state, "synthetic-code", false);
    if (!("reference" in callback) || !callback.reference)
      throw new Error("Missing native completion");
    expect(await connections.list("alice")).toEqual([]);
    await expect(
      connections.complete("bob", started.transactionId, callback.reference),
    ).rejects.toMatchObject({ code: "google_completion" });
    await expect(
      connections.complete("alice", "0".repeat(64), callback.reference),
    ).rejects.toMatchObject({ code: "google_completion" });
    await connections.complete(
      "alice",
      started.transactionId,
      callback.reference,
    );
    expect(await connections.list("alice")).toHaveLength(1);
    await expect(
      connections.complete("alice", started.transactionId, callback.reference),
    ).rejects.toMatchObject({ code: "google_completion" });
  } finally {
    if (savedUrl === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = savedUrl;
    if (savedAppId === undefined) delete process.env.GOOGLE_MOBILE_APP_ID;
    else process.env.GOOGLE_MOBILE_APP_ID = savedAppId;
  }
});
it("rejects expired native completion without creating a connected account", async () => {
  const savedUrl = process.env.BETTER_AUTH_URL,
    savedAppId = process.env.GOOGLE_MOBILE_APP_ID;
  process.env.BETTER_AUTH_URL = "https://sahaay.example.invalid";
  process.env.GOOGLE_MOBILE_APP_ID = "ABCDE12345.com.sahaay.app";
  try {
    const started = await connections.authorize("alice", {
      platform: "mobile",
      capabilities: ["gmail_read"],
    });
    const state = new URL(started.url).searchParams.get("state")!;
    nonce = createHash("sha256").update(state).digest("hex");
    const result = await connections.callback(state, "synthetic-code", false);
    if (!("reference" in result) || !result.reference)
      throw new Error("Missing native completion");
    await pool.query(
      "UPDATE google_oauth_completions SET expires_at=now()-interval '1 minute'",
    );
    await expect(
      connections.complete("alice", started.transactionId, result.reference),
    ).rejects.toMatchObject({ code: "google_completion" });
    expect(await connections.list("alice")).toEqual([]);
  } finally {
    if (savedUrl === undefined) delete process.env.BETTER_AUTH_URL;
    else process.env.BETTER_AUTH_URL = savedUrl;
    if (savedAppId === undefined) delete process.env.GOOGLE_MOBILE_APP_ID;
    else process.env.GOOGLE_MOBILE_APP_ID = savedAppId;
  }
});

it("supports identity-only account connection without silently requesting Gmail or Calendar", async () => {
  const { url } = await connections.authorize("alice", {
    platform: "web",
    capabilities: [],
  });
  const requested = new URL(url).searchParams.get("scope")!.split(" ");
  expect(requested.sort()).toEqual([...identityScopes].sort());
});

it("removes previously disconnected profiles without removing active connections", async () => {
  const id = await owned();
  await pool.query(
    "INSERT INTO google_connections(user_id,google_subject,email,display_name,status) VALUES('bob','old-subject','old@example.invalid','Old account','disconnected')",
  );
  await pool.query(
    await readFile(
      "apps/web/migrations/0014_remove_disconnected_google_accounts.sql",
      "utf8",
    ),
  );
  expect(await connections.list("bob")).toEqual([]);
  expect((await connections.list("alice"))[0].id).toBe(id);
});
