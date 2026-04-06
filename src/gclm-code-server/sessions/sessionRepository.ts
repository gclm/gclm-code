import type { Database } from 'bun:sqlite'
import type { SessionRecord } from './types.js'

function mapSession(row: Record<string, unknown>): SessionRecord {
  return {
    id: String(row.id),
    title: row.title ? String(row.title) : undefined,
    status: row.status as SessionRecord['status'],
    projectId: row.project_id ? String(row.project_id) : undefined,
    workspaceId: row.workspace_id ? String(row.workspace_id) : undefined,
    ownerUserId: String(row.owner_user_id),
    sourceChannel: row.source_channel as SessionRecord['sourceChannel'],
    executionSessionRef: row.execution_session_ref
      ? String(row.execution_session_ref)
      : undefined,
    metadataJson: row.metadata_json ? String(row.metadata_json) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastActiveAt: row.last_active_at ? String(row.last_active_at) : undefined,
    archivedAt: row.archived_at ? String(row.archived_at) : undefined,
  }
}

export class SessionRepository {
  constructor(private readonly db: Database) {}

  insert(record: SessionRecord): void {
    this.db
      .prepare(
        `INSERT INTO sessions (
          id, title, status, project_id, workspace_id, owner_user_id,
          source_channel, execution_session_ref, metadata_json,
          created_at, updated_at, last_active_at, archived_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.title ?? null,
        record.status,
        record.projectId ?? null,
        record.workspaceId ?? null,
        record.ownerUserId,
        record.sourceChannel,
        record.executionSessionRef ?? null,
        record.metadataJson ?? null,
        record.createdAt,
        record.updatedAt,
        record.lastActiveAt ?? null,
        record.archivedAt ?? null,
      )
  }

  updateStatus(input: {
    id: string
    status: SessionRecord['status']
    updatedAt: string
    archivedAt?: string
  }): void {
    this.db
      .prepare(
        `UPDATE sessions
         SET status = ?, updated_at = ?, archived_at = COALESCE(?, archived_at)
         WHERE id = ?`,
      )
      .run(input.status, input.updatedAt, input.archivedAt ?? null, input.id)
  }

  touch(id: string, updatedAt: string): void {
    this.db
      .prepare(
        `UPDATE sessions
         SET updated_at = ?, last_active_at = ?
         WHERE id = ?`,
      )
      .run(updatedAt, updatedAt, id)
  }

  findById(id: string): SessionRecord | null {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id)
    return row ? mapSession(row as Record<string, unknown>) : null
  }

  listByOwner(input: {
    ownerUserId: string
    sourceChannel?: SessionRecord['sourceChannel']
    status?: SessionRecord['status']
    limit: number
  }): SessionRecord[] {
    const conditions = ['owner_user_id = ?']
    const params: unknown[] = [input.ownerUserId]

    if (input.sourceChannel) {
      conditions.push('source_channel = ?')
      params.push(input.sourceChannel)
    }
    if (input.status) {
      conditions.push('status = ?')
      params.push(input.status)
    }

    params.push(input.limit)

    return this.db
      .prepare(
        `SELECT * FROM sessions
         WHERE ${conditions.join(' AND ')}
         ORDER BY updated_at DESC
         LIMIT ?`,
      )
      .all(...params)
      .map(row => mapSession(row as Record<string, unknown>))
  }

  findLatestByOwnerAndChannel(input: {
    ownerUserId: string
    sourceChannel: SessionRecord['sourceChannel']
  }): SessionRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM sessions
         WHERE owner_user_id = ? AND source_channel = ? AND archived_at IS NULL
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .get(input.ownerUserId, input.sourceChannel)

    return row ? mapSession(row as Record<string, unknown>) : null
  }
}
