import type { Database } from 'bun:sqlite'
import type { AuditRepository } from '../audit/auditRepository.js'
import type { IdempotencyRepository } from '../channels/shared/idempotencyRepository.js'
import type { FeishuPublisher } from '../channels/feishu/feishuPublisher.js'
import type { FeishuSessionRelay } from '../channels/feishu/feishuSessionRelay.js'
import type { FeishuAdapter } from '../channels/feishu/feishuAdapter.js'
import type { FeishuLongConnection } from '../channels/feishu/feishuLongConnection.js'
import type { SessionExecutionBridge } from '../execution/types.js'
import type { ChannelIdentityRepository } from '../identity/channelIdentityRepository.js'
import type { PermissionRepository } from '../permissions/permissionRepository.js'
import type { SessionBindingRepository } from '../sessions/sessionBindingRepository.js'
import type { SessionRepository } from '../sessions/sessionRepository.js'
import type { StreamHub } from '../transport/streamHub.js'
import type { StreamInfoService } from '../transport/streamInfoService.js'
import type { GclmCodeServerEnv } from '../config/env.js'

export type GclmCodeServerAppRepositories = {
  channelIdentities: ChannelIdentityRepository
  sessions: SessionRepository
  sessionBindings: SessionBindingRepository
  permissions: PermissionRepository
  idempotency: IdempotencyRepository
  audit: AuditRepository
}

export type GclmCodeServerAppState = {
  env: GclmCodeServerEnv
  db: Database
  repositories: GclmCodeServerAppRepositories
  streamHub: StreamHub
  streamInfoService: StreamInfoService
  executionBridge: SessionExecutionBridge
  channels: {
    feishuAdapter: FeishuAdapter
    feishuPublisher: FeishuPublisher
    feishuRelay: FeishuSessionRelay
    feishuLongConnection: FeishuLongConnection
  }
}
