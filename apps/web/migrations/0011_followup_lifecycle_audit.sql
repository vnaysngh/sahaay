-- Content-free provenance; legacy rows must not be retroactively attributed to a human.
ALTER TABLE followups ADD COLUMN lifecycle_source text NOT NULL DEFAULT 'legacy'
 CHECK(lifecycle_source IN ('legacy','chat_web','chat_telegram','web_inbox','related_state','backup_restore','due_worker','repair')),
 ADD COLUMN lifecycle_changed_at timestamptz;
UPDATE followups SET lifecycle_changed_at=COALESCE(cancelled_at,completed_at,dismissed_at,triggered_at,created_at);
CREATE OR REPLACE FUNCTION cancel_item_followups() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 UPDATE followups SET status='cancelled',cancelled_at=now(),version=version+1,updated_at=now(),lifecycle_source='related_state',lifecycle_changed_at=now()
 WHERE (related_item_id=OLD.id OR related_item_id IN (SELECT id FROM saved_items WHERE parent_id=OLD.id AND user_id=OLD.user_id)) AND user_id=OLD.user_id AND status IN ('scheduled','ready');
 RETURN OLD;
END $$;
