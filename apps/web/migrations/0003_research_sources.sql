CREATE TABLE research_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  message_id uuid NOT NULL,
  source_key text NOT NULL,
  url text NOT NULL,
  title text NOT NULL,
  kind text NOT NULL CHECK(kind IN ('cited','consulted')),
  retrieved_at timestamptz NOT NULL,
  published_at timestamptz,
  FOREIGN KEY(message_id,user_id) REFERENCES messages(id,user_id) ON DELETE CASCADE,
  UNIQUE(message_id,source_key)
);
CREATE INDEX research_source_message ON research_sources(message_id,user_id);
