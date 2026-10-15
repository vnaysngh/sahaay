-- One exact action may be proposed in more than one conversation. Link each
-- authenticated request without duplicating an external action or its payload.
ALTER TABLE action_approvals ADD CONSTRAINT action_approval_owned_id UNIQUE(id,user_id);
CREATE TABLE action_approval_turns (
 approval_id uuid NOT NULL, user_id text NOT NULL, request_id uuid NOT NULL,
 PRIMARY KEY(approval_id,user_id,request_id),
 FOREIGN KEY(approval_id,user_id) REFERENCES action_approvals(id,user_id) ON DELETE CASCADE
);
CREATE INDEX action_approval_turn_request ON action_approval_turns(user_id,request_id,approval_id);
INSERT INTO action_approval_turns(approval_id,user_id,request_id)
 SELECT id,user_id,request_id FROM action_approvals;
