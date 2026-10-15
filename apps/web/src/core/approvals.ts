import { createHash } from "node:crypto";
import type { Pool } from "pg";
import {
  actionInput,
  approvalSchema,
  type GoogleAction,
} from "@sahaay/api-client";
import { seal, unseal } from "../media/artifact-crypto";
import { RequestError } from "./validation";
import { GoogleConnections } from "../google/connections";
import { scopes } from "../google/scopes";
import { GmailService } from "../google/gmail";
import { CalendarService, calendarEvent } from "../google/calendar";
import { recordBehavior, type Behavior } from "../db/events";
export class ActionApprovals {
  constructor(
    private pool: Pool,
    private connections = new GoogleConnections(pool),
  ) {}
  async propose(owner: string, requestId: string, value: GoogleAction) {
    const proposal = actionInput.parse(value);
    if ("event" in proposal) calendarEvent(proposal.event);
    const bytes = Buffer.from(JSON.stringify(proposal));
    if (bytes.length > 24000)
      throw new RequestError(
        413,
        "action_size",
        "Use a shorter action proposal.",
      );
    const hash = createHash("sha256").update(bytes).digest("hex"),
      id = crypto.randomUUID();
    return this.connections.credential(
      owner,
      proposal.connectionId,
      requiredScopes(proposal),
      async (auth, db, connection) => {
        const preview =
          "calendarId" in proposal
            ? await new CalendarService(auth).approvalPreview(
                proposal.calendarId,
                "eventId" in proposal ? proposal.eventId : undefined,
                "etag" in proposal ? proposal.etag : undefined,
              )
            : null;
        const payload = Buffer.from(JSON.stringify({ proposal, preview }));
        const existing = (
          await db.query(
            "SELECT id,status,expires_at FROM action_approvals WHERE user_id=$1 AND proposal_hash=$2 AND (status IN ('executing','unknown') OR (status='pending' AND expires_at>now())) ORDER BY created_at DESC LIMIT 1",
            [owner, hash],
          )
        ).rows[0];
        if (existing) {
          await db.query(
            "INSERT INTO action_approval_turns(approval_id,user_id,request_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
            [existing.id, owner, requestId],
          );
          return {
            id: existing.id,
            status: existing.status,
            expiresAt: existing.expires_at.toISOString(),
            accountEmail: connection.email,
            proposal,
            preview,
            approvalPath: "/settings/connected",
          };
        }
        const count = (
          await db.query(
            "SELECT count(*)::int AS n FROM action_approvals WHERE user_id=$1 AND status='pending' AND expires_at>now()",
            [owner],
          )
        ).rows[0].n;
        if (count >= 20)
          throw new RequestError(
            429,
            "approval_limit",
            "Review or cancel your pending actions first.",
          );
        const row = (
          await db.query(
            "INSERT INTO action_approvals(id,user_id,connection_id,connection_revision,request_id,proposal_hash,encrypted_proposal) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(user_id,request_id,proposal_hash) DO UPDATE SET proposal_hash=EXCLUDED.proposal_hash RETURNING id,status,expires_at",
            [
              id,
              owner,
              proposal.connectionId,
              connection.revision,
              requestId,
              hash,
              await seal(payload, owner, id, "action_proposal"),
            ],
          )
        ).rows[0];
        await db.query(
          "INSERT INTO action_approval_turns(approval_id,user_id,request_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
          [row.id, owner, requestId],
        );
        return {
          id: row.id,
          status: row.status,
          expiresAt: row.expires_at.toISOString(),
          accountEmail: connection.email,
          proposal,
          preview,
          approvalPath: "/settings/connected",
        };
      },
    );
  }
  async list(owner: string, conversationId?: string) {
    await this.pool.query(
      "UPDATE action_approvals SET status='cancelled' WHERE user_id=$1 AND status='pending' AND expires_at<now()",
      [owner],
    );
    await this.pool.query(
      "UPDATE action_approvals SET status='unknown' WHERE user_id=$1 AND status='executing' AND executed_at<now()-interval '2 minutes'",
      [owner],
    );
    const rows = (
      await this.pool.query(
        "SELECT a.*,c.email, ARRAY(SELECT DISTINCT t.request_id FROM action_approval_turns t JOIN messages m ON m.user_id=t.user_id AND m.request_id=t.request_id WHERE t.approval_id=a.id AND t.user_id=a.user_id AND ($2::uuid IS NULL OR m.conversation_id=$2) ORDER BY t.request_id LIMIT 100) AS linked_requests FROM action_approvals a JOIN google_connections c ON c.id=a.connection_id AND c.user_id=a.user_id WHERE a.user_id=$1 AND a.created_at>now()-interval '7 days' AND ($2::uuid IS NULL OR EXISTS(SELECT 1 FROM action_approval_turns t JOIN messages m ON m.user_id=t.user_id AND m.request_id=t.request_id WHERE t.approval_id=a.id AND t.user_id=a.user_id AND m.conversation_id=$2)) ORDER BY a.created_at DESC LIMIT 20",
        [owner, conversationId ?? null],
      )
    ).rows;
    return Promise.all(
      rows.map(async (r) =>
        approvalSchema.parse({
          id: r.id,
          requestId: r.request_id,
          requestIds: r.linked_requests,
          status: r.status,
          expiresAt: r.expires_at.toISOString(),
          accountEmail: r.email,
          ...JSON.parse(
            (
              await unseal(r.encrypted_proposal, owner, r.id, "action_proposal")
            ).toString(),
          ),
          result: r.result,
        }),
      ),
    );
  }
  // Only an authenticated first-party UI can call this boundary. No execute tool
  // is exposed to the model; confirmation submits only ID, never edited arguments.
  async decide(owner: string, id: string, decision: "approve" | "cancel") {
    if (decision === "cancel") {
      const r = await this.pool.query(
        "UPDATE action_approvals SET status='cancelled' WHERE id=$1 AND user_id=$2 AND status='pending' RETURNING id",
        [id, owner],
      );
      if (!r.rowCount)
        throw new RequestError(
          409,
          "approval_state",
          "This action is unavailable or already processed.",
        );
      return { outcome: "cancelled" };
    }
    const row = (
      await this.pool.query(
        "UPDATE action_approvals SET status='executing',executed_at=now() WHERE id=$1 AND user_id=$2 AND status='pending' AND expires_at>now() RETURNING *",
        [id, owner],
      )
    ).rows[0];
    if (!row)
      throw new RequestError(
        409,
        "approval_state",
        "This approval expired or was already processed. Check its status; don’t repeat the action.",
      );
    try {
      const proposal = actionInput.parse(
        JSON.parse(
          (
            await unseal(row.encrypted_proposal, owner, id, "action_proposal")
          ).toString(),
        ).proposal,
      );
      const result = await this.connections.credential(
        owner,
        proposal.connectionId,
        requiredScopes(proposal),
        async (auth, db, c) => {
          if (c.revision !== row.connection_revision)
            throw new RequestError(
              409,
              "approval_stale",
              "The Google connection changed. Review a fresh proposal.",
            );
          const r = proposal.kind.startsWith("gmail_")
            ? await new GmailService(auth).compose(
                (
                  proposal as Extract<
                    GoogleAction,
                    { kind: "gmail_draft" | "gmail_send" }
                  >
                ).message,
                c.email,
                id,
                proposal.kind === "gmail_draft",
              )
            : await new CalendarService(auth).execute(
                proposal as Extract<
                  GoogleAction,
                  {
                    kind:
                      "calendar_create" | "calendar_update" | "calendar_delete";
                  }
                >,
                id,
              );
          await db.query(
            "UPDATE action_approvals SET status='succeeded',result=$3::jsonb WHERE id=$1 AND user_id=$2",
            [id, owner, JSON.stringify(r)],
          );
          await recordBehavior(
            db,
            owner,
            crypto.randomUUID(),
            actionEvent[proposal.kind],
          );
          return r;
        },
      );
      return result;
    } catch (e) {
      const definite =
        e instanceof RequestError &&
        [400, 401, 403, 404, 409, 413, 429].includes(e.status);
      await this.pool.query(
        "UPDATE action_approvals SET status=$3,result=$4::jsonb WHERE id=$1 AND user_id=$2 AND status='executing'",
        [
          id,
          owner,
          definite ? "failed" : "unknown",
          JSON.stringify({
            outcome: definite
              ? "not_completed"
              : "outcome_unknown_check_google_do_not_retry",
          }),
        ],
      );
      throw e;
    }
  }
}
const actionEvent: Record<GoogleAction["kind"], Behavior> = {
  gmail_draft: "gmail_draft_created",
  gmail_send: "gmail_message_sent",
  calendar_create: "calendar_event_created",
  calendar_update: "calendar_event_updated",
  calendar_delete: "calendar_event_deleted",
};
export function requiredScopes(action: GoogleAction) {
  const required =
    action.kind === "gmail_draft"
      ? scopes.gmail_compose
      : action.kind === "gmail_send"
        ? scopes.gmail_send
        : scopes.calendar_write;
  return "message" in action && action.message.replyMessageId
    ? [...required, ...scopes.gmail_read]
    : required;
}
