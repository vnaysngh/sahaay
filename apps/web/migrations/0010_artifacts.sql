-- New uploads retain encrypted received image bytes for the existing 24h window.
-- The preview remains unchanged; legacy uploads have no original to promote.
ALTER TABLE attachments ADD COLUMN original_image bytea, ADD COLUMN original_mime text, ADD COLUMN original_bytes integer;
CREATE TABLE artifacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 media_type text NOT NULL DEFAULT 'image' CHECK(media_type='image'),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 100), category text NOT NULL CHECK(category IN ('identity_document','travel_document','receipt','invoice','booking','medical_document','product','screenshot','photo','other')),
 mime_type text NOT NULL CHECK(mime_type IN ('image/png','image/jpeg','image/webp')),size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 8388608),
 original bytea NOT NULL,understanding bytea NOT NULL,
 source_attachment_id uuid NOT NULL,source_message_id uuid NOT NULL,source_conversation_id uuid NOT NULL,
 related_item_id uuid,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,user_id),UNIQUE(user_id,source_attachment_id),
 FOREIGN KEY(related_item_id,user_id) REFERENCES saved_items(id,user_id) ON DELETE SET NULL (related_item_id)
);
CREATE INDEX artifact_owner ON artifacts(user_id,created_at DESC);
CREATE TABLE message_artifacts (
 user_id text NOT NULL,message_id uuid NOT NULL,artifact_id uuid NOT NULL,
 PRIMARY KEY(message_id,artifact_id),
 FOREIGN KEY(message_id,user_id) REFERENCES messages(id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(artifact_id,user_id) REFERENCES artifacts(id,user_id) ON DELETE CASCADE
);
ALTER TABLE record_mutations DROP CONSTRAINT record_mutations_operation_check;
ALTER TABLE record_mutations ADD CONSTRAINT record_mutations_operation_check CHECK(operation IN ('remember','update_memory','forget','save','update_item','remove_item','followup_create','followup_update','followup_cancel','followup_done','artifact_create','artifact_delete','artifact_original'));
ALTER TABLE product_events DROP CONSTRAINT product_event_behaviors;
ALTER TABLE product_events ADD CONSTRAINT product_event_behaviors CHECK(behaviors <@ ARRAY['state_created','state_revisited','state_updated','memory_created','memory_recalled','saved_item_created','unsupported_action','followup_created','followup_rescheduled','followup_triggered','followup_delivered','followup_opened','followup_completed','followup_dismissed','followup_cancelled','inbox_viewed','inbox_item_opened','artifact_created','artifact_accessed','artifact_retrieved','artifact_original_retrieved','artifact_searched','artifact_deleted','artifact_linked_to_state']::text[]);
