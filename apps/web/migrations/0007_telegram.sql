-- External channel identity is a link, never the canonical Sahaay user ID.
CREATE TABLE telegram_links (
 telegram_user_id text PRIMARY KEY CHECK(telegram_user_id ~ '^[0-9]+$'),
 user_id text NOT NULL UNIQUE REFERENCES "user"(id) ON DELETE CASCADE,
 conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE telegram_link_codes (
 token_hash text PRIMARY KEY,
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);
CREATE INDEX telegram_code_expiry ON telegram_link_codes(expires_at);
-- Content-free delivery receipts: no raw update payload/text/transcript/file URL.
CREATE TABLE telegram_updates (
 bot_id text NOT NULL, update_id bigint NOT NULL,
 user_id text REFERENCES "user"(id) ON DELETE CASCADE,
 conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
 request_id uuid NOT NULL, reply_id bigint,
 state text NOT NULL DEFAULT 'processing' CHECK(state IN ('processing','done','interrupted','delivery_unknown')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(bot_id,update_id)
);
CREATE INDEX telegram_update_expiry ON telegram_updates(created_at);
