import type { Database } from 'bun:sqlite'
import type { AuditRepository } from '../audit/auditRepository.js'
import type { IdempotencyRepository } from '../channels/shared/idempotencyRepository.js'
import type { ChannelIdentityRepository } from '../identity/channelIdentityRepository.js'
import type { PermissionRepository } from '../permissions/permissionRepository.js'
import type { SessionBindingRepository } from '../sessions/sessionBindingRepository.js'
import type { SessionRepository } from '../sessions/sessionRepository.js'
import type { StreamHub } from '../transport/streamHub.js'
import type { StreamInfoService } from '../transport/streamInfoService.js'

export type GclmCodeServerAppRepositories = {
  channelIdentities: ChannelIdentityRepository
  sessions: SessionRepository
  sessionBindings: SessionBindingRepository
  permissions: PermissionRepository
  idempotency: IdempotencyRepository
  audit: AuditRepository
}

export type GclmCodeServerAppState = {
  db: Database
  repositories: GclmCodeServerAppRepositories
  streamHub: StreamHub
  streamInfoService: StreamInfoService
}
