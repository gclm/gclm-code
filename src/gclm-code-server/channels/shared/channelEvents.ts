export type IdempotencyKeySource =
  | 'event_id'
  | 'action_id'
  | 'token'
  | 'payload_hash_derived'

export type ChannelInboundEvent = {
  provider: 'feishu' | 'dingtalk'
  eventId: string
  eventType: 'message.created' | 'session.resume' | 'unknown'
  providerUserId: string
  tenantId?: string
  sessionIdHint?: string
  text?: string
  rawRefId?: string
  receivedAt: string
}

export type ChannelActionCommand = {
  provider: 'feishu' | 'dingtalk'
  actionId: string
  actionType: 'permission_response' | 'open_session' | 'resume_session'
  providerUserId: string
  tenantId?: string
  sessionId?: string
  permissionRequestId?: string
  decision?: 'approve' | 'deny'
  rawRefId?: string
  receivedAt: string
}

export type WebhookIdempotencyRecord = {
  id: string
  provider: 'feishu' | 'dingtalk'
  idempotencyKey: string
  payloadHash?: string
  keySource: IdempotencyKeySource
  eventType?: string
  status: 'processing' | 'processed' | 'ignored' | 'rejected'
  firstSeenAt: string
  lastSeenAt: string
  expiresAt?: string
  responseSnapshotJson?: string
}

export function buildIdempotencyKey(input: {
  provider: 'feishu' | 'dingtalk'
  eventId?: string
  actionId?: string
  token?: string
  payloadHash?: string
}): { idempotencyKey: string; keySource: IdempotencyKeySource } {
  if (input.eventId) {
    return { idempotencyKey: input.eventId, keySource: 'event_id' }
  }
  if (input.actionId) {
    return { idempotencyKey: input.actionId, keySource: 'action_id' }
  }
  if (input.token) {
    return { idempotencyKey: input.token, keySource: 'token' }
  }
  if (input.payloadHash) {
    return {
      idempotencyKey: `${input.provider}:payload:${input.payloadHash}`,
      keySource: 'payload_hash_derived',
    }
  }
  throw new Error('Unable to build idempotency key without event/action/token/payload hash')
}
