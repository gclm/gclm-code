import type { Database } from 'bun:sqlite'
import type { ChannelIdentity } from './types.js'

function mapChannelIdentity(row: Record<string, unknown>): ChannelIdentity {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    provider: row.provider as ChannelIdentity['provider'],
    providerUserId: String(row.provider_user_id),
    tenantScope: String(row.tenant_scope ?? ''),
    tenantId: row.tenant_id ? String(row.tenant_id) : undefined,
    displayName: row.display_name ? String(row.display_name) : undefined,
    profileJson: row.profile_json ? String(row.profile_json) : undefined,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}

export class ChannelIdentityRepository {
  constructor(private readonly db: Database) {}

  upsert(record: ChannelIdentity): void {
    this.db
      .prepare(
        `INSERT INTO channel_identities (
          id, user_id, provider, provider_user_id, tenant_scope, tenant_id,
          display_name, profile_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(provider, provider_user_id, tenant_scope) DO UPDATE SET
          user_id = excluded.user_id,
          tenant_id = excluded.tenant_id,
          display_name = excluded.display_name,
          profile_json = excluded.profile_json,
          updated_at = excluded.updated_at`,
      )
      .run(
        record.id,
        record.userId,
        record.provider,
        record.providerUserId,
        record.tenantScope,
        record.tenantId ?? null,
        record.displayName ?? null,
        record.profileJson ?? null,
        record.createdAt,
        record.updatedAt,
      )
  }

  findByProviderIdentity(input: {
    provider: ChannelIdentity['provider']
    providerUserId: string
    tenantScope?: string
  }): ChannelIdentity | null {
    const row = this.db
      .prepare(
        `SELECT * FROM channel_identities
         WHERE provider = ? AND provider_user_id = ? AND tenant_scope = ?`,
      )
      .get(input.provider, input.providerUserId, input.tenantScope ?? '')

    return row ? mapChannelIdentity(row as Record<string, unknown>) : null
  }

  findFirstByUserIdAndProvider(input: {
    userId: string
    provider: ChannelIdentity['provider']
  }): ChannelIdentity | null {
    const row = this.db
      .prepare(
        `SELECT * FROM channel_identities
         WHERE user_id = ? AND provider = ?
         ORDER BY updated_at DESC
         LIMIT 1`,
      )
      .get(input.userId, input.provider)

    return row ? mapChannelIdentity(row as Record<string, unknown>) : null
  }
}
