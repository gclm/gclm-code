import type { Database } from 'bun:sqlite'
import type { PermissionRequestRecord } from './types.js'

function mapPermission(row: Record<string, unknown>): PermissionRequestRecord {
  return {
    id: String(row.id),
    sessionId: String(row.session_id),
    toolName: String(row.tool_name),
    toolUseId: String(row.tool_use_id),
    status: row.status as PermissionRequestRecord['status'],
    scope: row.scope as PermissionRequestRecord['scope'],
    inputJson: String(row.input_json),
    requestedByChannel: row.requested_by_channel
      ? String(row.requested_by_channel)
      : undefined,
    requestedByUserId: row.requested_by_user_id
      ? String(row.requested_by_user_id)
      : undefined,
    resolutionChannel: row.resolution_channel
      ? String(row.resolution_channel)
      : undefined,
    resolvedBy: row.resolved_by ? String(row.resolved_by) : undefined,
    resolutionMessage: row.resolution_message
      ? String(row.resolution_message)
      : undefined,
    requestedAt: String(row.requested_at),
    expiresAt: row.expires_at ? String(row.expires_at) : undefined,
    resolvedAt: row.resolved_at ? String(row.resolved_at) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export class PermissionRepository {
  constructor(private readonly db: Database) {}

  insert(record: PermissionRequestRecord): void {
    this.db
      .prepare(
        `INSERT INTO permission_requests (
          id, session_id, tool_name, tool_use_id, status, scope, input_json,
          requested_by_channel, requested_by_user_id, resolution_channel,
          resolved_by, resolution_message, requested_at, expires_at,
          resolved_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        record.id,
        record.sessionId,
        record.toolName,
        record.toolUseId,
        record.status,
        record.scope,
        record.inputJson,
        record.requestedByChannel ?? null,
        record.requestedByUserId ?? null,
        record.resolutionChannel ?? null,
        record.resolvedBy ?? null,
        record.resolutionMessage ?? null,
        record.requestedAt,
        record.expiresAt ?? null,
        record.resolvedAt ?? null,
        record.createdAt,
        record.updatedAt,
      )
  }

  findPendingBySession(sessionId: string): PermissionRequestRecord[] {
    return this.db
      .prepare(
        `SELECT * FROM permission_requests
         WHERE session_id = ? AND status = 'pending'
         ORDER BY requested_at DESC`,
      )
      .all(sessionId)
      .map(row => mapPermission(row as Record<string, unknown>))
  }
}
