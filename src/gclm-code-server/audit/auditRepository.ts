import type { Database } from 'bun:sqlite'
import type { AuditEventRecord } from './types.js'

export class AuditRepository {
  constructor(private readonly db: Database) {}

  insert(record: AuditEventRecord): void {
    this.db
      .prepare(
        `INSERT INTO audit_events (
          id, event_type, session_id, actor_type, actor_id,
          provider, request_id, payload_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.eventType,
        record.sessionId ?? null,
        record.actorType,
        record.actorId,
        record.provider ?? null,
        record.requestId ?? null,
        record.payloadJson ?? null,
        record.createdAt,
      )
  }
}
