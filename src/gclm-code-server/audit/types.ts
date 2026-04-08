import type { ChannelProvider } from '../identity/types.js'

export type AuditEventRecord = {
  id: string
  eventType: string
  sessionId?: string
  actorType: 'user' | 'channel' | 'system'
  actorId: string
  provider?: ChannelProvider
  requestId?: string
  payloadJson?: string
  createdAt: string
}
