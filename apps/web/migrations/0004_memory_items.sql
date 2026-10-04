-- Deliberate durable records outlive temporary source messages/media.
CREATE TABLE memories (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 memory_key text NOT NULL CHECK(length(memory_key) BETWEEN 1 AND 100),
 type text NOT NULL CHECK(type IN ('semantic','episodic')), category text,
 content text NOT NULL CHECK(length(content) BETWEEN 1 AND 1000), structured_value jsonb,
 source_type text NOT NULL DEFAULT 'user_explicit' CHECK(source_type='user_explicit'),
 source_id uuid NOT NULL, conversation_id uuid NOT NULL, confidence double precision NOT NULL DEFAULT 1 CHECK(confidence=1),
 scope text NOT NULL DEFAULT 'personal', valid_from timestamptz NOT NULL DEFAULT now(), valid_until timestamptz,
 supersedes_id uuid, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(id,user_id), FOREIGN KEY(supersedes_id,user_id) REFERENCES memories(id,user_id),
 CHECK(valid_until IS NULL OR valid_until>=valid_from)
);
CREATE UNIQUE INDEX memory_current ON memories(user_id,scope,memory_key) WHERE valid_until IS NULL;
CREATE INDEX memory_lookup ON memories(user_id,scope,updated_at);
CREATE TABLE saved_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
 kind text NOT NULL, content text NOT NULL CHECK(length(content) BETWEEN 1 AND 2000), url text, structured_value jsonb,
 list_label text, status text NOT NULL DEFAULT 'saved' CHECK(status IN ('saved','done','archived')),
 source_type text NOT NULL DEFAULT 'user_explicit' CHECK(source_type='user_explicit'), source_id uuid NOT NULL, conversation_id uuid NOT NULL,
 version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX item_lookup ON saved_items(user_id,list_label,updated_at);
-- No original content, memory keys, URLs or model arguments in mutation evidence.
CREATE TABLE record_mutations (
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, request_id uuid NOT NULL, action_id text NOT NULL,
 operation text NOT NULL CHECK(operation IN ('remember','update_memory','forget','save','update_item','remove_item')),
 target_id uuid NOT NULL, version integer NOT NULL, suppressed_source_ids uuid[] NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 PRIMARY KEY(user_id,request_id,action_id)
);
CREATE INDEX mutation_expiry ON record_mutations(expires_at);
