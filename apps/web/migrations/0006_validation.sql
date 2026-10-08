ALTER TABLE "user" ADD COLUMN processing_paused boolean NOT NULL DEFAULT false;
CREATE TABLE product_events (
 user_id text NOT NULL REFERENCES "user"(id) ON DELETE CASCADE, request_id uuid NOT NULL,
 intents text[] NOT NULL CHECK(intents <@ ARRAY['ask','understand','research','compare','remember','recall','organize']::text[]),
 modalities text[] NOT NULL CHECK(modalities <@ ARRAY['text','image','voice','url']::text[]),
 language text NOT NULL CHECK(language IN ('en','hi','mixed','unknown')),
 outcome text NOT NULL CHECK(outcome IN ('started','complete','failed','interrupted')),
 unsupported_target text CHECK(unsupported_target IN ('booking','payment','mail','calendar','background','document','location','other')),
 error_class text CHECK(error_class IN ('timeout','response_failed','interrupted')),
 created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,request_id)
);
CREATE INDEX product_event_expiry ON product_events(created_at);
CREATE TABLE rate_limit (id text PRIMARY KEY,key text NOT NULL UNIQUE,count integer NOT NULL,last_request bigint NOT NULL);
