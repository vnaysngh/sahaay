-- Mobile is a client of the existing account/core. No separate identity or scheduler.
CREATE TABLE mobile_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 installation_id uuid NOT NULL, revision uuid NOT NULL DEFAULT gen_random_uuid(), expo_token text NOT NULL UNIQUE CHECK(length(expo_token)<=256),
 project_id uuid NOT NULL, platform text NOT NULL CHECK(platform IN ('ios','android')),
 enabled boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(user_id,installation_id), UNIQUE(id,user_id)
);
CREATE INDEX mobile_device_owner ON mobile_devices(user_id);
ALTER TABLE followups ADD CONSTRAINT followup_owned_id UNIQUE(id,user_id);
CREATE TABLE mobile_push_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 followup_id uuid NOT NULL,
 followup_version integer NOT NULL CHECK(followup_version>0),
 accepted_at timestamptz,receipt_checked_at timestamptz,
 device_id uuid NOT NULL, device_revision uuid NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','sending','accepted','delivered','unknown','failed','cancelled')),
 attempts integer NOT NULL DEFAULT 0, attempt_id uuid, ticket_id text, retry_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(followup_id,user_id) REFERENCES followups(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(device_id,user_id) REFERENCES mobile_devices(id,user_id) ON DELETE CASCADE,
 UNIQUE(followup_id,followup_version,device_id)
);
CREATE INDEX followup_ready_push ON followups(triggered_at,id) WHERE status='ready';
CREATE INDEX mobile_push_pending ON mobile_push_deliveries(status,retry_at) WHERE status IN ('pending','sending','accepted');
ALTER TABLE product_events DROP CONSTRAINT product_events_channel_check;
ALTER TABLE product_events ADD CONSTRAINT product_events_channel_check CHECK(channel IN ('web','telegram','mobile'));
ALTER TABLE followups DROP CONSTRAINT followups_lifecycle_source_check;
ALTER TABLE followups ADD CONSTRAINT followups_lifecycle_source_check CHECK(lifecycle_source IN ('legacy','chat_web','chat_telegram','chat_mobile','web_inbox','mobile_inbox','related_state','backup_restore','due_worker','repair'));

ALTER TABLE product_events DROP CONSTRAINT product_event_behaviors;
ALTER TABLE product_events ADD CONSTRAINT product_event_behaviors CHECK(behaviors <@ ARRAY['state_created','state_revisited','state_updated','memory_created','memory_recalled','saved_item_created','unsupported_action','followup_created','followup_rescheduled','followup_triggered','followup_delivered','followup_opened','followup_completed','followup_dismissed','followup_cancelled','inbox_viewed','inbox_item_opened','artifact_created','artifact_accessed','artifact_retrieved','artifact_original_retrieved','artifact_searched','artifact_deleted','artifact_linked_to_state','mobile_app_opened','mobile_login_completed','mobile_chat_started','mobile_message_sent','mobile_share_received','mobile_share_completed','mobile_artifact_opened','mobile_saved_item_opened','mobile_followup_opened','mobile_followup_completed']::text[]);
