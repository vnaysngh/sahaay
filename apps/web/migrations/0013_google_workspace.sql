ALTER TABLE "user" ADD COLUMN google_connections_revision uuid NOT NULL DEFAULT gen_random_uuid();
CREATE TABLE google_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 google_subject text NOT NULL, email text NOT NULL, display_name text NOT NULL,
 status text NOT NULL CHECK(status IN ('connected','reauthorization_required','disconnected','temporarily_unavailable')),
 scopes text[] NOT NULL DEFAULT '{}', revision uuid NOT NULL DEFAULT gen_random_uuid(),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), last_successful_use_at timestamptz,
 UNIQUE(user_id,google_subject), UNIQUE(id,user_id)
);
CREATE INDEX google_connection_owner ON google_connections(user_id,created_at,id);
CREATE TABLE google_credentials (
 connection_id uuid PRIMARY KEY, user_id text NOT NULL, encrypted_tokens bytea NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(connection_id,user_id) REFERENCES google_connections(id,user_id) ON DELETE CASCADE
);
CREATE TABLE google_oauth_transactions (
 state_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 connection_id uuid, expected_revision uuid, requested_scopes text[] NOT NULL,
 platform text NOT NULL CHECK(platform IN ('web','mobile')), encrypted_verifier bytea NOT NULL, owner_revision uuid NOT NULL,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 FOREIGN KEY(connection_id,user_id) REFERENCES google_connections(id,user_id) ON DELETE CASCADE
);
CREATE INDEX google_oauth_expiry ON google_oauth_transactions(expires_at);
CREATE INDEX google_oauth_owner ON google_oauth_transactions(user_id,expires_at);
CREATE TABLE google_oauth_completions (
 reference_hash text PRIMARY KEY, transaction_id text NOT NULL UNIQUE,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 encrypted_grant bytea NOT NULL, expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);
CREATE INDEX google_completion_expiry ON google_oauth_completions(expires_at);
CREATE INDEX google_completion_owner ON google_oauth_completions(user_id,expires_at);
CREATE TABLE action_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 connection_id uuid NOT NULL, connection_revision uuid NOT NULL,
 request_id uuid NOT NULL, proposal_hash text NOT NULL, encrypted_proposal bytea NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','executing','succeeded','failed','unknown','cancelled')),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes', created_at timestamptz NOT NULL DEFAULT now(),
 executed_at timestamptz, result jsonb, FOREIGN KEY(connection_id,user_id) REFERENCES google_connections(id,user_id) ON DELETE CASCADE,
 UNIQUE(user_id,request_id,proposal_hash)
);
CREATE INDEX action_approval_owner ON action_approvals(user_id,created_at,id);
CREATE INDEX action_approval_expiry ON action_approvals(expires_at);
-- Fixed event names only, through the existing privacy-conscious event store.
ALTER TABLE product_events DROP CONSTRAINT product_event_behaviors;
ALTER TABLE product_events ADD CONSTRAINT product_event_behaviors CHECK(behaviors <@ ARRAY['state_created','state_revisited','state_updated','memory_created','memory_recalled','saved_item_created','unsupported_action','followup_created','followup_rescheduled','followup_triggered','followup_delivered','followup_opened','followup_completed','followup_dismissed','followup_cancelled','inbox_viewed','inbox_item_opened','artifact_created','artifact_accessed','artifact_retrieved','artifact_original_retrieved','artifact_searched','artifact_deleted','artifact_linked_to_state','mobile_app_opened','mobile_login_completed','mobile_chat_started','mobile_message_sent','mobile_share_received','mobile_share_completed','mobile_artifact_opened','mobile_saved_item_opened','mobile_followup_opened','mobile_followup_completed','google_connection_started','google_connection_completed','google_connection_failed','google_connection_disconnected','google_reauthorization_required','gmail_search_executed','gmail_draft_created','gmail_message_sent','calendar_events_read','calendar_event_created','calendar_event_updated','calendar_event_deleted']::text[]);
