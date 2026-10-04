-- Content-free provenance for turns that used durable records. Expires with chat.
ALTER TABLE messages ADD COLUMN context_record_source_ids uuid[] NOT NULL DEFAULT '{}';
