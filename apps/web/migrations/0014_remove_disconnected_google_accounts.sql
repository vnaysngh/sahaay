-- Remove profile metadata retained by the old disconnect behavior.
-- Invalidate older OAuth attempts before deleting their connection records.
UPDATE "user" SET google_connections_revision=gen_random_uuid()
WHERE id IN (SELECT user_id FROM google_connections WHERE status='disconnected');
DELETE FROM google_oauth_transactions WHERE user_id IN
 (SELECT user_id FROM google_connections WHERE status='disconnected');
DELETE FROM google_oauth_completions WHERE user_id IN
 (SELECT user_id FROM google_connections WHERE status='disconnected');
DELETE FROM google_connections WHERE status='disconnected';
