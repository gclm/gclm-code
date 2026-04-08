ALTER TABLE webhook_idempotency RENAME TO channel_event_idempotency;

DROP INDEX IF EXISTS uq_webhook_idempotency_provider_key;
CREATE UNIQUE INDEX uq_channel_event_idempotency_provider_key
  ON channel_event_idempotency(provider, idempotency_key);

DROP INDEX IF EXISTS idx_webhook_idempotency_expires;
CREATE INDEX idx_channel_event_idempotency_expires
  ON channel_event_idempotency(expires_at);
