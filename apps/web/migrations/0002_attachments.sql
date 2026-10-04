CREATE TABLE attachments (
 id uuid PRIMARY KEY, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 message_id uuid, conversation_id uuid, kind text NOT NULL CHECK(kind IN ('image','audio')),
 filename text NOT NULL, mime text NOT NULL, bytes integer NOT NULL CHECK(bytes > 0),
 width integer, height integer, duration double precision,
 transcript text, provider_metadata jsonb,
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 CONSTRAINT attachment_owned_id UNIQUE(id,user_id),
 CONSTRAINT attachment_owned_conversation FOREIGN KEY(conversation_id,user_id) REFERENCES conversations(id,user_id) ON DELETE CASCADE
);
ALTER TABLE messages ADD CONSTRAINT message_owned_id UNIQUE(id,user_id);
ALTER TABLE attachments ADD CONSTRAINT attachment_owned_message FOREIGN KEY(message_id,user_id) REFERENCES messages(id,user_id) ON DELETE CASCADE;
CREATE INDEX attachment_message ON attachments(message_id);
CREATE INDEX attachment_owner_created ON attachments(user_id,created_at);
CREATE INDEX attachment_expiry ON attachments(expires_at);
