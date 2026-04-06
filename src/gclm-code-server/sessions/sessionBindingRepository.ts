import type { Database } from 'bun:sqlite'
import type { SessionBindingRecord } from './types.js'

function mapSessionBinding(row: Record<string, unknown>): SessionBindingRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    channelIdentityId: String(row.channel_identity_id),
    userId: String(row.user_id),
    bindingType: row.binding_type as SessionBindingRecord['bindingType'],
    isPrimary: Boolean(row.is_primary),
    lastMessageId: row.last_message_id ? String(row.last_message_id) : undefined,
    lastActiveAt: row.last_active_at ? String(row.last_active_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export class SessionBindingRepository {
  constructor(private readonly db: Database) {}

  insert(record: SessionBindingRecord): void {
    this.db
      .prepare(
        `INSERT INTO session_bindings (
          id, session_id, channel_identity_id, user_id, binding_type,
          is_primary, last_message_id, last_active_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.sessionId,
        record.channelIdentityId,
        record.userId,
        record.bindingType,
        record.isPrimary ? 1 : 0,
        record.lastMessageId ?? null,
        record.lastActiveAt ?? null,
        record.createdAt,
        record.updatedAt,
      )
  }

  findByIdentityAndSession(input: {
    channelIdentityId: string
    sessionId: string
  }): SessionBindingRecord | null {
    const row = this.db
      .prepare(
        'SELECT * FROM session_bindings WHERE channel_identity_id = ? AND session_id = ?',
      )
      .get(input.channelIdentityId, input.sessionId)

    return row ? mapSessionBinding(row as Record<string, unknown>) : null
  }

  findPrimaryByIdentity(channelIdentityId: string): SessionBindingRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM session_bindings
         WHERE channel_identity_id = ? AND is_primary = 1
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .get(channelIdentityId)

    return row ? mapSessionBinding(row as Record<string, unknown>) : null
  }
}
