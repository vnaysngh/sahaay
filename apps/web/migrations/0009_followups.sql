ALTER TABLE "user" ADD COLUMN timezone text;
CREATE TABLE followups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 related_item_id uuid, reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),
 trigger_type text NOT NULL DEFAULT 'explicit_request' CHECK(trigger_type='explicit_request'),
 scheduled_for timestamptz NOT NULL, timezone text NOT NULL,
 status text NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','ready','completed','dismissed','cancelled')),
 delivery_status text NOT NULL DEFAULT 'pending' CHECK(delivery_status IN ('pending','sending','delivered','unknown','failed')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), attempts integer NOT NULL DEFAULT 0,
 attempt_id uuid, retry_at timestamptz, delivered_at timestamptz, telegram_message_id bigint,
 source_id uuid NOT NULL, conversation_id uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 triggered_at timestamptz, opened_at timestamptz, completed_at timestamptz, dismissed_at timestamptz, cancelled_at timestamptz,
 FOREIGN KEY(related_item_id,user_id) REFERENCES saved_items(id,user_id) ON DELETE SET NULL (related_item_id)
);
CREATE INDEX followup_due ON followups(scheduled_for) WHERE status='scheduled';
CREATE INDEX followup_inbox ON followups(user_id,status,scheduled_for);
-- Deleting related state must stop reminders, including on restored backups.
CREATE FUNCTION cancel_item_followups() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 UPDATE followups SET status='cancelled',cancelled_at=now(),version=version+1,updated_at=now()
 WHERE (related_item_id=OLD.id OR related_item_id IN (SELECT id FROM saved_items WHERE parent_id=OLD.id AND user_id=OLD.user_id)) AND user_id=OLD.user_id AND status IN ('scheduled','ready');
 RETURN OLD;
END $$;
CREATE TRIGGER cancel_related_followups BEFORE DELETE ON saved_items FOR EACH ROW EXECUTE FUNCTION cancel_item_followups();
ALTER TABLE record_mutations DROP CONSTRAINT record_mutations_operation_check;
ALTER TABLE record_mutations ADD CONSTRAINT record_mutations_operation_check CHECK(operation IN ('remember','update_memory','forget','save','update_item','remove_item','followup_create','followup_update','followup_cancel','followup_done'));
ALTER TABLE product_events DROP CONSTRAINT product_event_behaviors;
ALTER TABLE product_events ADD CONSTRAINT product_event_behaviors CHECK(behaviors <@ ARRAY['state_created','state_revisited','state_updated','memory_created','memory_recalled','saved_item_created','unsupported_action','followup_created','followup_rescheduled','followup_triggered','followup_delivered','followup_opened','followup_completed','followup_dismissed','followup_cancelled','inbox_viewed','inbox_item_opened']::text[]);
ALTER TABLE product_events DROP CONSTRAINT unsupported_action_category;
ALTER TABLE product_events ADD CONSTRAINT unsupported_action_category CHECK(unsupported_category IN ('travel','shopping','money','creator','productivity','fitness','communication','monitoring','other'));
ALTER TABLE product_events ADD COLUMN unsupported_capability text CHECK(unsupported_capability ~ '^[a-z][a-z0-9_]{0,79}$'),
 ADD COLUMN channel text CHECK(channel IN ('web','telegram'));
