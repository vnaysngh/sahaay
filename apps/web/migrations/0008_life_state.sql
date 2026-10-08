-- Objects are typed saved records, not preferences or an automatic profile.
ALTER TABLE saved_items ADD COLUMN record_role text NOT NULL DEFAULT 'item',
  ADD COLUMN parent_id uuid, ADD COLUMN state_label text;
ALTER TABLE saved_items ADD CONSTRAINT saved_item_owned_id UNIQUE(id,user_id),
  ADD CONSTRAINT saved_item_role CHECK(record_role IN ('item','object')),
  ADD CONSTRAINT saved_item_state CHECK(state_label IS NULL OR length(state_label) BETWEEN 1 AND 60),
  ADD CONSTRAINT saved_item_parent_shape CHECK(parent_id IS NULL OR (record_role='item' AND parent_id<>id)),
  ADD CONSTRAINT saved_item_parent_owner FOREIGN KEY(parent_id,user_id)
    REFERENCES saved_items(id,user_id) ON DELETE SET NULL (parent_id);
CREATE INDEX item_parent ON saved_items(user_id,parent_id,updated_at);
-- One level only: objects contain items, never other objects. Roles are immutable.
CREATE FUNCTION check_item_parent() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.record_role<>OLD.record_role THEN
    RAISE EXCEPTION 'Record roles are immutable' USING ERRCODE='23514';
  END IF;
  IF NEW.parent_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM saved_items WHERE id=NEW.parent_id AND user_id=NEW.user_id AND record_role='object'
  ) THEN
    RAISE EXCEPTION 'Parent must be an owned object' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER item_parent_check BEFORE INSERT OR UPDATE ON saved_items
  FOR EACH ROW EXECUTE FUNCTION check_item_parent();
ALTER TABLE product_events ADD COLUMN behaviors text[] NOT NULL DEFAULT '{}',
  ADD CONSTRAINT product_event_behaviors CHECK(behaviors <@ ARRAY[
    'state_created','state_revisited','state_updated','memory_created','memory_recalled',
    'saved_item_created','unsupported_action']::text[]);

ALTER TABLE product_events ADD COLUMN unsupported_category text,
  ADD CONSTRAINT unsupported_action_category CHECK(unsupported_category IN ('travel','shopping','money','creator','productivity','fitness','communication','other'));
