import type { ChannelProvider } from '../identity/types.js'

export type SessionStatus =
  | 'creating'
  | 'running'
  | 'waiting_input'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'archived'

export type SessionRecord = {
  id: string
  title?: string
  status: SessionStatus
  projectId?: string
  workspaceId?: string
  ownerUserId: string
  sourceChannel: ChannelProvider
  executionSessionRef?: string
  metadataJson?: string
  createdAt: string
  updatedAt: string
  lastActiveAt?: string
  archivedAt?: string
}

export type SessionBindingType = 'owner' | 'participant' | 'channel-entry'

export type SessionBindingRecord = {
  id: string
  sessionId: string
  channelIdentityId: string
  userId: string
  bindingType: SessionBindingType
  isPrimary: boolean
  lastMessageId?: string
  lastActiveAt?: string
  createdAt: string
  updatedAt: string
}
