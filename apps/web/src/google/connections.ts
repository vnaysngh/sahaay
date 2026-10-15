import { createHash, randomBytes } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { google } from "googleapis";
import type { OAuth2Client, Credentials } from "google-auth-library";
import { CodeChallengeMethod } from "google-auth-library";
import { authorizeInput, connectionSchema } from "@sahaay/api-client";
import { z } from "zod";
import { seal, unseal } from "../media/artifact-crypto";
import { RequestError } from "../core/validation";
import { recordBehavior } from "../db/events";
import { capabilities, canonicalScope, identityScopes, scopes } from "./scopes";
import { googleFailure } from "./errors";
export function googleConfiguration() {
  const base = new URL(process.env.BETTER_AUTH_URL ?? "http://localhost:3000");
  if (
    base.protocol !== "https:" &&
    !["localhost", "127.0.0.1"].includes(base.hostname)
  )
    throw new RequestError(
      503,
      "google_configuration",
      "Google needs a secure backend URL.",
    );
  if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET)
    throw new RequestError(
      503,
      "google_configuration",
      "Google connections aren’t configured yet.",
    );
  return {
    base: base.origin,
    redirect: base.origin + "/api/connections/google/callback",
  };
}
export function mobileGoogleLinksConfigured() {
  const ios = /^[A-Z0-9]{10}\.com\.sahaay\.app$/.test(
    process.env.GOOGLE_MOBILE_APP_ID ?? "",
  );
  const android = (process.env.GOOGLE_ANDROID_CERT_FINGERPRINTS ?? "")
    .split(",")
    .some((s) => /^([A-F0-9]{2}:){31}[A-F0-9]{2}$/.test(s));
  return ios || android;
}
export function oauthClient(): OAuth2Client {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    googleConfiguration().redirect,
  );
  client.transporter.defaults = {
    timeout: 15000,
    retry: false,
    retryConfig: { retry: 0 },
    maxContentLength: 2000000,
  };
  return client;
}
const grantSchema = z.object({
  tx: z.object({
    user_id: z.string(),
    owner_revision: z.string().uuid(),
    connection_id: z.string().uuid().nullable(),
    expected_revision: z.string().uuid().nullable(),
  }),
  identity: z.object({
    sub: z.string().min(1),
    email: z.string().email(),
    name: z.string().optional(),
  }),
  tokens: z.object({
    access_token: z.string().min(1),
    refresh_token: z.string().nullish(),
    expiry_date: z.number().nullish(),
  }),
  granted: z.array(z.string()).max(20),
});
type GoogleGrant = z.infer<typeof grantSchema>;
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
export class GoogleConnections {
  constructor(
    readonly pool: Pool,
    private makeClient = oauthClient,
  ) {}
  async list(owner: string) {
    const rows = (
      await this.pool.query(
        "SELECT id,email,display_name,status,scopes,last_successful_use_at FROM google_connections WHERE user_id=$1 AND status!='disconnected' ORDER BY updated_at DESC,id LIMIT 20",
        [owner],
      )
    ).rows;
    return rows.map((r) =>
      connectionSchema.parse({
        id: r.id,
        email: r.email,
        displayName: r.display_name,
        status: r.status,
        scopes: r.scopes,
        capabilities: capabilities(r.scopes),
        lastSuccessfulUseAt: r.last_successful_use_at?.toISOString() ?? null,
      }),
    );
  }
  async authorize(owner: string, value: z.infer<typeof authorizeInput>) {
    const input = authorizeInput.parse(value);
    googleConfiguration();
    if (
      input.platform === "mobile" &&
      !googleConfiguration().base.startsWith("https://")
    )
      throw new RequestError(
        503,
        "google_mobile_https",
        "Mobile Google authorization requires the deployed HTTPS backend.",
      );
    if (input.platform === "mobile" && !mobileGoogleLinksConfigured())
      throw new RequestError(
        503,
        "google_mobile_links",
        "Mobile Google connections need verified app-link setup first. You can connect on Web and use the account here.",
      );
    const client = this.makeClient();
    const tx = await this.pool.connect();
    try {
      await tx.query("BEGIN");
      await tx.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        owner,
      ]);
      const ownerRow = (
        await tx.query(
          'SELECT google_connections_revision FROM "user" WHERE id=$1 AND NOT processing_paused FOR SHARE',
          [owner],
        )
      ).rows[0];
      if (!ownerRow)
        throw new RequestError(
          403,
          "paused",
          "Sign in to an active Sahaay account before connecting Google.",
        );
      const existing = input.connectionId
        ? (
            await tx.query(
              "SELECT * FROM google_connections WHERE id=$1 AND user_id=$2 AND status!='disconnected' FOR UPDATE",
              [input.connectionId, owner],
            )
          ).rows[0]
        : null;
      if (input.connectionId && !existing)
        throw new RequestError(
          404,
          "google_connection",
          "Google account not found.",
        );
      const count = (
        await tx.query(
          "SELECT count(*)::int AS n FROM google_connections WHERE user_id=$1 AND status!='disconnected'",
          [owner],
        )
      ).rows[0].n;
      if (!existing && count >= 10)
        throw new RequestError(
          409,
          "google_limit",
          "Connect at most ten Google accounts.",
        );
      await tx.query(
        "DELETE FROM google_oauth_transactions WHERE user_id=$1 AND expires_at<now()",
        [owner],
      );
      const attempts = (
        await tx.query(
          "SELECT ((SELECT count(*) FROM google_oauth_transactions WHERE user_id=$1)+(SELECT count(*) FROM google_oauth_completions WHERE user_id=$1 AND expires_at>now()))::int AS n",
          [owner],
        )
      ).rows[0].n;
      if (attempts >= 5)
        throw new RequestError(
          429,
          "google_oauth_limit",
          "Too many connection attempts. Finish one or wait for it to expire.",
        );
      const state = randomBytes(32).toString("base64url"),
        stateHash = hash(state);
      const pkce = await client.generateCodeVerifierAsync();
      const requested = [
        ...new Set([
          ...identityScopes,
          ...input.capabilities.flatMap((c) => scopes[c]),
          ...(existing?.scopes ?? []),
        ]),
      ];
      await tx.query(
        "INSERT INTO google_oauth_transactions(state_hash,user_id,connection_id,expected_revision,requested_scopes,platform,encrypted_verifier,owner_revision) VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
        [
          stateHash,
          owner,
          existing?.id ?? null,
          existing?.revision ?? null,
          requested,
          input.platform,
          await seal(
            Buffer.from(pkce.codeVerifier),
            owner,
            stateHash,
            "google_pkce",
          ),
          ownerRow.google_connections_revision,
        ],
      );
      const url = new URL(
        client.generateAuthUrl({
          access_type: "offline",
          scope: requested,
          state,
          include_granted_scopes: true,
          prompt: existing ? "consent" : "consent select_account",
          ...(existing ? { login_hint: existing.email } : {}),
          code_challenge: pkce.codeChallenge,
          code_challenge_method: CodeChallengeMethod.S256,
        }),
      );
      url.searchParams.set("nonce", stateHash);
      await recordBehavior(
        tx,
        owner,
        crypto.randomUUID(),
        "google_connection_started",
      );
      await tx.query("COMMIT");
      return { url: url.toString(), transactionId: stateHash };
    } catch (e) {
      await tx.query("ROLLBACK");
      throw e;
    } finally {
      tx.release();
    }
  }
  async callback(
    state: string,
    code: string | null,
    denied: boolean,
    browserOwner?: string,
  ) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(state))
      throw new RequestError(
        400,
        "google_state",
        "Invalid Google connection attempt.",
      );
    const stateHash = hash(state);
    const tx = (
      await this.pool.query(
        "DELETE FROM google_oauth_transactions WHERE state_hash=$1 AND expires_at>now() RETURNING *",
        [stateHash],
      )
    ).rows[0];
    if (!tx || (tx.platform === "web" && tx.user_id !== browserOwner))
      throw new RequestError(
        400,
        "google_state",
        "Connection attempt expired or was already used. Start again.",
      );
    if (denied || !code) {
      await recordBehavior(
        this.pool,
        tx.user_id,
        crypto.randomUUID(),
        "google_connection_failed",
      );
      return { platform: tx.platform as "web" | "mobile", success: false };
    }
    const auth = this.makeClient();
    let tokens: Credentials;
    try {
      tokens = (
        await auth.getToken({
          code,
          codeVerifier: (
            await unseal(
              tx.encrypted_verifier,
              tx.user_id,
              stateHash,
              "google_pkce",
            )
          ).toString(),
          redirect_uri: googleConfiguration().redirect,
        })
      ).tokens;
      if (!tokens.access_token || !tokens.id_token)
        throw new Error("Missing tokens");
      const identity = (
        await auth.verifyIdToken({
          idToken: tokens.id_token,
          audience: process.env.GOOGLE_CLIENT_ID,
        })
      ).getPayload();
      if (
        !identity?.sub ||
        !identity.email ||
        !identity.email_verified ||
        (identity as { nonce?: string }).nonce !== stateHash
      )
        throw new RequestError(
          400,
          "google_identity",
          "Google identity could not be verified.",
        );
      const info = await auth.getTokenInfo(tokens.access_token);
      const granted = info.scopes.map(canonicalScope);
      if (
        // Incremental authorization can return permissions previously granted
        // to this OAuth client, even when no existing connection was selected.
        // Accept only capabilities this application explicitly supports.
        granted.some(
          (s) =>
            ![...identityScopes, ...Object.values(scopes).flat()].includes(s),
        ) ||
        !identityScopes.every((s) => granted.includes(s))
      )
        throw new RequestError(
          400,
          "google_scopes",
          "Unexpected Google permissions. Start again with the required permissions.",
        );
      const grant = grantSchema.parse({
        tx: {
          user_id: tx.user_id,
          owner_revision: tx.owner_revision,
          connection_id: tx.connection_id,
          expected_revision: tx.expected_revision,
        },
        identity: {
          sub: identity.sub,
          email: identity.email,
          name: identity.name,
        },
        tokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expiry_date: tokens.expiry_date,
        },
        granted,
      });
      if (tx.platform === "mobile") {
        const reference = randomBytes(32).toString("base64url");
        const pending = await this.pool.query(
          'INSERT INTO google_oauth_completions(reference_hash,transaction_id,user_id,encrypted_grant) SELECT $1,$2,id,$4 FROM "user" WHERE id=$3 AND google_connections_revision=$5 AND NOT processing_paused FOR SHARE RETURNING transaction_id',
          [
            hash(reference),
            stateHash,
            tx.user_id,
            await seal(
              Buffer.from(JSON.stringify(grant)),
              tx.user_id,
              stateHash,
              "google_completion",
            ),
            tx.owner_revision,
          ],
        );
        if (!pending.rowCount)
          throw new RequestError(
            409,
            "google_account_changed",
            "Google access was changed or paused. Start a fresh connection.",
          );
        return {
          platform: "mobile" as const,
          success: true,
          reference,
          transactionId: stateHash,
        };
      }
      await this.saveGrant(grant);
      return { platform: tx.platform as "web" | "mobile", success: true };
    } catch (e) {
      await recordBehavior(
        this.pool,
        tx.user_id,
        crypto.randomUUID(),
        "google_connection_failed",
      );
      throw googleFailure(e);
    }
  }
  async complete(owner: string, transactionId: string, reference: string) {
    if (
      !/^[a-f0-9]{64}$/.test(transactionId) ||
      !/^[A-Za-z0-9_-]{43}$/.test(reference)
    )
      throw new RequestError(
        400,
        "google_completion",
        "Invalid connection completion.",
      );
    const row = (
      await this.pool.query(
        "DELETE FROM google_oauth_completions WHERE reference_hash=$1 AND transaction_id=$2 AND user_id=$3 AND expires_at>now() RETURNING encrypted_grant",
        [hash(reference), transactionId, owner],
      )
    ).rows[0];
    if (!row)
      throw new RequestError(
        400,
        "google_completion",
        "Connection completion expired or was already used. Start again.",
      );
    const grant = grantSchema.parse(
      JSON.parse(
        (
          await unseal(
            row.encrypted_grant,
            owner,
            transactionId,
            "google_completion",
          )
        ).toString(),
      ),
    );
    if (grant.tx.user_id !== owner)
      throw new RequestError(
        403,
        "google_completion",
        "Connection owner mismatch.",
      );
    await this.saveGrant(grant);
    return { ok: true as const };
  }
  private async saveGrant({ tx, identity, tokens, granted }: GoogleGrant) {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [
        tx.user_id,
      ]);
      if (
        !(
          await db.query(
            'SELECT id FROM "user" WHERE id=$1 AND google_connections_revision=$2 AND NOT processing_paused FOR SHARE',
            [tx.user_id, tx.owner_revision],
          )
        ).rowCount
      )
        throw new RequestError(
          409,
          "google_account_changed",
          "Google access was changed or paused. Start a fresh connection.",
        );
      const row = (
        await db.query(
          "SELECT * FROM google_connections WHERE user_id=$1 AND google_subject=$2 FOR UPDATE",
          [tx.user_id, identity.sub],
        )
      ).rows[0];
      if (
        tx.connection_id &&
        (!row ||
          row.id !== tx.connection_id ||
          row.revision !== tx.expected_revision)
      )
        throw new RequestError(
          409,
          "google_account_changed",
          "Choose the same Google account you are reconnecting. To connect a different account, use Add another Google account.",
        );
      const id = row?.id ?? crypto.randomUUID();
      const prior = row
        ? (
            await db.query(
              "SELECT encrypted_tokens FROM google_credentials WHERE connection_id=$1 AND user_id=$2",
              [id, tx.user_id],
            )
          ).rows[0]
        : null;
      const old: Credentials = prior
        ? JSON.parse(
            (
              await unseal(
                prior.encrypted_tokens,
                tx.user_id,
                id,
                "google_tokens",
              )
            ).toString(),
          )
        : {};
      const kept = {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token ?? old.refresh_token,
        expiry_date: tokens.expiry_date,
      };
      if (!kept.refresh_token)
        throw new RequestError(
          409,
          "google_refresh_missing",
          "Google didn’t grant ongoing access. Reconnect and grant consent.",
        );
      const count = (
        await db.query(
          "SELECT count(*)::int AS n FROM google_connections WHERE user_id=$1 AND status!='disconnected'",
          [tx.user_id],
        )
      ).rows[0].n;
      if ((!row || row.status === "disconnected") && count >= 10)
        throw new RequestError(
          409,
          "google_limit",
          "Too many Google accounts.",
        );
      await db.query(
        "INSERT INTO google_connections(id,user_id,google_subject,email,display_name,status,scopes) VALUES($1,$2,$3,$4,$5,'connected',$6) ON CONFLICT(user_id,google_subject) DO UPDATE SET email=EXCLUDED.email,display_name=EXCLUDED.display_name,status='connected',scopes=EXCLUDED.scopes,revision=gen_random_uuid(),updated_at=now()",
        [
          id,
          tx.user_id,
          identity.sub,
          identity.email,
          (identity.name ?? identity.email).slice(0, 200),
          granted,
        ],
      );
      await db.query(
        "INSERT INTO google_credentials(connection_id,user_id,encrypted_tokens) VALUES($1,$2,$3) ON CONFLICT(connection_id) DO UPDATE SET encrypted_tokens=EXCLUDED.encrypted_tokens,updated_at=now()",
        [
          id,
          tx.user_id,
          await seal(
            Buffer.from(JSON.stringify(kept)),
            tx.user_id,
            id,
            "google_tokens",
          ),
        ],
      );
      await recordBehavior(
        db,
        tx.user_id,
        crypto.randomUUID(),
        "google_connection_completed",
      );
      await db.query("COMMIT");
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }
  // A row lock serializes refresh and disconnect across Node instances. No timer refresh.
  async credential<T>(
    owner: string,
    id: string,
    required: string[],
    work: (
      auth: OAuth2Client,
      db: PoolClient,
      connection: { email: string; revision: string },
    ) => Promise<T>,
  ) {
    const db = await this.pool.connect();
    try {
      await db.query("BEGIN");
      await db.query('SELECT id FROM "user" WHERE id=$1 FOR SHARE', [owner]);
      const row = (
        await db.query(
          'SELECT c.*,g.encrypted_tokens,u.processing_paused FROM google_connections c JOIN "user" u ON u.id=c.user_id LEFT JOIN google_credentials g ON g.connection_id=c.id AND g.user_id=c.user_id WHERE c.id=$1 AND c.user_id=$2 FOR UPDATE OF c',
          [id, owner],
        )
      ).rows[0];
      if (!row)
        throw new RequestError(
          404,
          "google_connection",
          "Google account not found.",
        );
      if (row.processing_paused)
        throw new RequestError(
          403,
          "paused",
          "Resume Sahaay before using connected accounts.",
        );
      if (
        row.status === "disconnected" ||
        row.status === "reauthorization_required" ||
        !row.encrypted_tokens
      )
        throw new RequestError(
          401,
          "google_reauthorization",
          "Reconnect this Google account.",
        );
      const missing = required.filter(
        (s) =>
          !row.scopes.includes(s) &&
          !(
            s === scopes.gmail_send[0] &&
            row.scopes.includes(scopes.gmail_compose[0])
          ) &&
          !(
            s === scopes.calendar_read[0] &&
            row.scopes.includes(scopes.calendar_write[0])
          ),
      );
      if (missing.length)
        throw new RequestError(
          403,
          "google_permission_required",
          "Grant additional Google permissions in Connected Accounts.",
        );
      const tokens: Credentials = JSON.parse(
        (
          await unseal(row.encrypted_tokens, owner, id, "google_tokens")
        ).toString(),
      );
      const auth = this.makeClient();
      auth.setCredentials(tokens);
      // Disable the library's automatic 401 replay; writes must never be replayed.
      auth.forceRefreshOnFailure = false;
      try {
        if (
          !tokens.access_token ||
          !tokens.expiry_date ||
          tokens.expiry_date < Date.now() + 60000
        ) {
          const updated = (await auth.refreshAccessToken()).credentials;
          auth.setCredentials({
            ...updated,
            refresh_token: updated.refresh_token ?? tokens.refresh_token,
          });
          await db.query(
            "UPDATE google_credentials SET encrypted_tokens=$3,updated_at=now() WHERE connection_id=$1 AND user_id=$2",
            [
              id,
              owner,
              await seal(
                Buffer.from(JSON.stringify(auth.credentials)),
                owner,
                id,
                "google_tokens",
              ),
            ],
          );
        }
        // API clients get only a current access token. OAuth2Client otherwise
        // may refresh and replay a request on 401/403, unsafe for external writes.
        const apiAuth = this.makeClient();
        apiAuth.eagerRefreshThresholdMillis = 0;
        apiAuth.setCredentials({
          access_token: auth.credentials.access_token,
          expiry_date: auth.credentials.expiry_date ?? Date.now() + 300000,
        });
        const result = await work(apiAuth, db, row);
        await db.query(
          "UPDATE google_connections SET status='connected',last_successful_use_at=now(),updated_at=now() WHERE id=$1 AND user_id=$2",
          [id, owner],
        );
        await db.query("COMMIT");
        return result;
      } catch (e) {
        const safe = googleFailure(e);
        if (safe.code === "google_reauthorization") {
          await db.query(
            "UPDATE google_connections SET status='reauthorization_required',updated_at=now() WHERE id=$1 AND user_id=$2",
            [id, owner],
          );
          await recordBehavior(
            db,
            owner,
            crypto.randomUUID(),
            "google_reauthorization_required",
          );
          await db.query("COMMIT");
        } else {
          if (["google_unavailable", "google_rate_limit"].includes(safe.code))
            await db.query(
              "UPDATE google_connections SET status='temporarily_unavailable',updated_at=now() WHERE id=$1 AND user_id=$2",
              [id, owner],
            );
          await db.query("COMMIT");
        }
        throw safe;
      }
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }
  async disconnect(owner: string, id: string) {
    const db = await this.pool.connect();
    let revocationConfirmed = false;
    try {
      await db.query("BEGIN");
      await db.query('SELECT id FROM "user" WHERE id=$1 FOR UPDATE', [owner]);
      const row = (
        await db.query(
          "SELECT * FROM google_connections WHERE id=$1 AND user_id=$2 FOR UPDATE",
          [id, owner],
        )
      ).rows[0];
      if (!row)
        throw new RequestError(
          404,
          "google_connection",
          "Google account not found.",
        );
      const credential = (
        await db.query(
          "SELECT encrypted_tokens FROM google_credentials WHERE connection_id=$1 AND user_id=$2",
          [id, owner],
        )
      ).rows[0];
      if (credential) {
        try {
          const token: Credentials = JSON.parse(
            (
              await unseal(
                credential.encrypted_tokens,
                owner,
                id,
                "google_tokens",
              )
            ).toString(),
          );
          await this.makeClient().revokeToken(
            token.refresh_token ?? token.access_token!,
          );
          revocationConfirmed = true;
        } catch {
          /* Local withdrawal must work even when Google is unreachable or revoked. */
        }
      }
      await db.query("DELETE FROM google_oauth_completions WHERE user_id=$1", [
        owner,
      ]);
      await db.query(
        "DELETE FROM google_credentials WHERE connection_id=$1 AND user_id=$2",
        [id, owner],
      );
      await db.query("DELETE FROM google_oauth_transactions WHERE user_id=$1", [
        owner,
      ]);
      await db.query(
        'UPDATE "user" SET google_connections_revision=gen_random_uuid() WHERE id=$1',
        [owner],
      );
      await db.query(
        "DELETE FROM action_approvals WHERE connection_id=$1 AND user_id=$2",
        [id, owner],
      );
      await db.query(
        "DELETE FROM google_connections WHERE id=$1 AND user_id=$2",
        [id, owner],
      );
      await recordBehavior(
        db,
        owner,
        crypto.randomUUID(),
        "google_connection_disconnected",
      );
      await db.query("COMMIT");
      return { revocationConfirmed };
    } catch (e) {
      await db.query("ROLLBACK");
      throw e;
    } finally {
      db.release();
    }
  }
}
