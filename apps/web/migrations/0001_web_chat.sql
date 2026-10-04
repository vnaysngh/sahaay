CREATE TABLE "user" (
 id text PRIMARY KEY, name text NOT NULL, email text NOT NULL UNIQUE, email_verified boolean NOT NULL DEFAULT false, image text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE session (
 id text PRIMARY KEY, token text NOT NULL UNIQUE, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL, ip_address text, user_agent text, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX session_owner ON session(user_id);
CREATE TABLE account (
 id text PRIMARY KEY, account_id text NOT NULL, provider_id text NOT NULL, user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 access_token text, refresh_token text, id_token text, access_token_expires_at timestamptz, refresh_token_expires_at timestamptz, scope text, password text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX account_owner ON account(user_id);
CREATE TABLE verification (
 id text PRIMARY KEY, identifier text NOT NULL, value text NOT NULL, expires_at timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX verification_identifier ON verification(identifier);
CREATE TABLE conversations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 title text NOT NULL DEFAULT 'New conversation', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT conversation_owned_id UNIQUE(id,user_id)
);
CREATE INDEX conversation_history ON conversations(user_id,updated_at);
CREATE TABLE messages (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), conversation_id uuid NOT NULL, user_id text NOT NULL, request_id uuid NOT NULL,
 role text NOT NULL CHECK(role IN ('user','assistant')), content text NOT NULL,
 status text NOT NULL CHECK(status IN ('running','complete','failed','interrupted')), error_code text,
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 CONSTRAINT messages_owned_conversation FOREIGN KEY(conversation_id,user_id) REFERENCES conversations(id,user_id) ON DELETE CASCADE,
 CONSTRAINT message_request_role UNIQUE(user_id,request_id,role)
);
CREATE UNIQUE INDEX one_running_turn ON messages(conversation_id) WHERE status='running';
CREATE INDEX message_history ON messages(conversation_id,created_at);
CREATE INDEX message_user_quota ON messages(user_id,created_at) WHERE role='user';
