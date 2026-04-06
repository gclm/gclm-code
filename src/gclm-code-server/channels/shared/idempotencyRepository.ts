import type { Database } from 'bun:sqlite'
import type { WebhookIdempotencyRecord } from './channelEvents.js'

function mapWebhookIdempotency(
  row: Record<string, unknown>,
): WebhookIdempotencyRecord {
  return {
    id: String(row.id),
    provider: row.provider as WebhookIdempotencyRecord['provider'],
    idempotencyKey: String(row.idempotency_key),
    payloadHash: row.payload_hash ? String(row.payload_hash) : undefined,
    keySource: row.key_source as WebhookIdempotencyRecord['keySource'],
    eventType: row.event_type ? String(row.event_type) : undefined,
    status: row.status as WebhookIdempotencyRecord['status'],
    firstSeenAt: String(row.first_seen_at),
    lastSeenAt: String(row.last_seen_at),
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    responseSnapshotJson: row.response_snapshot_json
      ? String(row.response_snapshot_json)
      : undefined,
  }
}

export class IdempotencyRepository {
  constructor(private readonly db: Database) {}

  upsert(record: WebhookIdempotencyRecord): void {
    this.db
      .prepare(
        `INSERT INTO webhook_idempotency (
          id, provider, idempotency_key, payload_hash, key_source,
          event_type, status, first_seen_at, last_seen_at, expires_at,
          response_snapshot_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, idempotency_key) DO UPDATE SET
          payload_hash = excluded.payload_hash,
          key_source = excluded.key_source,
          event_type = excluded.event_type,
          status = excluded.status,
          last_seen_at = excluded.last_seen_at,
          expires_at = excluded.expires_at,
          response_snapshot_json = excluded.response_snapshot_json`,
      )
      .run(
        record.id,
        record.provider,
        record.idempotencyKey,
        record.payloadHash ?? null,
        record.keySource,
        record.eventType ?? null,
        record.status,
        record.firstSeenAt,
        record.lastSeenAt,
        record.expiresAt ?? null,
        record.responseSnapshotJson ?? null,
      )
  }

  findByProviderAndKey(input: {
    provider: WebhookIdempotencyRecord['provider']
    idempotencyKey: string
  }): WebhookIdempotencyRecord | null {
    const row = this.db
      .prepare(
        'SELECT * FROM webhook_idempotency WHERE provider = ? AND idempotency_key = ?',
      )
      .get(input.provider, input.idempotencyKey)

    return row ? mapWebhookIdempotency(row as Record<string, unknown>) : null
  }
}
