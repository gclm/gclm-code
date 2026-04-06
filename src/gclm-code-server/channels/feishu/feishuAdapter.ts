import { createHash, randomUUID } from 'crypto'
import type { GclmCodeServerAppState } from '../../app/types.js'
import { buildIdempotencyKey } from '../shared/channelEvents.js'
import {
  feishuActionPayloadSchema,
  feishuMessageEventSchema,
  feishuUrlVerificationSchema,
  parseFeishuTextContent,
  type FeishuActionPayload,
  type FeishuMessageEventPayload,
} from './dto.js'

type FeishuInboundResponse =
  | {
      type: 'url_verification'
      challenge: string
    }
  | {
      type: 'event'
      accepted: boolean
      idempotencyKey: string
      sessionId?: string
      requestId?: string
      ignoredReason?: string
    }

type FeishuActionResponse = {
  accepted: boolean
  idempotencyKey: string
  sessionId?: string
  requestId?: string
  ignoredReason?: string
}

function payloadHash(payload: unknown): string {
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}

function getProviderUserIdFromEvent(payload: FeishuMessageEventPayload): string | null {
  return (
    payload.event.sender.sender_id.open_id ??
    payload.event.sender.sender_id.union_id ??
    payload.event.sender.sender_id.user_id ??
    null
  )
}

function getProviderUserIdFromAction(payload: FeishuActionPayload): string | null {
  return payload.open_id ?? payload.user_id ?? null
}

export class FeishuAdapter {
  constructor(private readonly state: GclmCodeServerAppState) {}

  async handleEvent(payload: unknown): Promise<FeishuInboundResponse> {
    const verification = feishuUrlVerificationSchema.safeParse(payload)
    if (verification.success) {
      return {
        type: 'url_verification',
        challenge: verification.data.challenge,
      }
    }

    const parsed = feishuMessageEventSchema.parse(payload)
    const hash = payloadHash(parsed)
    const { idempotencyKey, keySource } = buildIdempotencyKey({
      provider: 'feishu',
      eventId: parsed.header.event_id,
      payloadHash: hash,
    })
    const now = new Date().toISOString()

    const existing = this.state.repositories.idempotency.findByProviderAndKey({
      provider: 'feishu',
      idempotencyKey,
    })
    if (existing?.status === 'processed') {
      return {
        type: 'event',
        accepted: true,
        idempotencyKey,
        ignoredReason: 'duplicate_event',
      }
    }

    this.state.repositories.idempotency.upsert({
      id: existing?.id ?? `idem_${randomUUID()}`,
      provider: 'feishu',
      idempotencyKey,
      payloadHash: hash,
      keySource,
      eventType: parsed.header.event_type,
      status: 'processing',
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
    })

    const providerUserId = getProviderUserIdFromEvent(parsed)
    const text = parseFeishuTextContent(parsed.event.message?.content)

    if (parsed.header.event_type !== 'im.message.receive_v1') {
      this.markIdempotencyProcessed(existing?.id ?? `idem_${randomUUID()}`, {
        idempotencyKey,
        hash,
        now,
        eventType: parsed.header.event_type,
        ignoredReason: 'unsupported_event_type',
      })
      return {
        type: 'event',
        accepted: true,
        idempotencyKey,
        ignoredReason: 'unsupported_event_type',
      }
    }

    if (!providerUserId || !text) {
      this.markIdempotencyProcessed(existing?.id ?? `idem_${randomUUID()}`, {
        idempotencyKey,
        hash,
        now,
        eventType: parsed.header.event_type,
        ignoredReason: 'missing_sender_or_text',
      })
      return {
        type: 'event',
        accepted: true,
        idempotencyKey,
        ignoredReason: 'missing_sender_or_text',
      }
    }

    const { sessionId, requestId } = await this.submitInboundText({
      providerUserId,
      tenantScope: parsed.header.tenant_key ?? parsed.event.sender.tenant_key ?? '',
      text,
      title: `Feishu ${providerUserId}`,
      sourceMessageId: parsed.event.message?.message_id,
    })

    this.state.repositories.idempotency.upsert({
      id: existing?.id ?? `idem_${randomUUID()}`,
      provider: 'feishu',
      idempotencyKey,
      payloadHash: hash,
      keySource,
      eventType: parsed.header.event_type,
      status: 'processed',
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
      responseSnapshotJson: JSON.stringify({ sessionId, requestId }),
    })

    return {
      type: 'event',
      accepted: true,
      idempotencyKey,
      sessionId,
      requestId,
    }
  }

  async handleAction(payload: unknown): Promise<FeishuActionResponse> {
    const parsed = feishuActionPayloadSchema.parse(payload)
    const hash = payloadHash(parsed)
    const { idempotencyKey, keySource } = buildIdempotencyKey({
      provider: 'feishu',
      token: parsed.token,
      payloadHash: hash,
    })
    const now = new Date().toISOString()
    const existing = this.state.repositories.idempotency.findByProviderAndKey({
      provider: 'feishu',
      idempotencyKey,
    })

    if (existing?.status === 'processed') {
      return {
        accepted: true,
        idempotencyKey,
        ignoredReason: 'duplicate_action',
      }
    }

    const recordId = existing?.id ?? `idem_${randomUUID()}`
    this.state.repositories.idempotency.upsert({
      id: recordId,
      provider: 'feishu',
      idempotencyKey,
      payloadHash: hash,
      keySource,
      eventType: 'interactive.action',
      status: 'processing',
      firstSeenAt: existing?.firstSeenAt ?? now,
      lastSeenAt: now,
    })

    const actionValue = parsed.action?.value ?? {}
    const actionKind = typeof actionValue.action === 'string' ? actionValue.action : ''
    const providerUserId = getProviderUserIdFromAction(parsed)

    if (!providerUserId) {
      this.state.repositories.idempotency.upsert({
        id: recordId,
        provider: 'feishu',
        idempotencyKey,
        payloadHash: hash,
        keySource,
        eventType: 'interactive.action',
        status: 'ignored',
        firstSeenAt: existing?.firstSeenAt ?? now,
        lastSeenAt: now,
        responseSnapshotJson: JSON.stringify({ ignoredReason: 'missing_provider_user_id' }),
      })
      return {
        accepted: true,
        idempotencyKey,
        ignoredReason: 'missing_provider_user_id',
      }
    }

    if (actionKind === 'permission_response') {
      const sessionId =
        typeof actionValue.sessionId === 'string' ? actionValue.sessionId : undefined
      const requestId =
        typeof actionValue.requestId === 'string' ? actionValue.requestId : undefined
      const decision =
        actionValue.decision === 'approve' || actionValue.decision === 'allow'
          ? 'allow'
          : actionValue.decision === 'deny'
            ? 'deny'
            : undefined

      if (!sessionId || !requestId || !decision) {
        return this.finishAction(recordId, existing?.firstSeenAt ?? now, now, {
          accepted: true,
          idempotencyKey,
          ignoredReason: 'missing_permission_fields',
        })
      }

      const session = this.state.repositories.sessions.findById(sessionId)
      if (!session) {
        return this.finishAction(recordId, existing?.firstSeenAt ?? now, now, {
          accepted: true,
          idempotencyKey,
          ignoredReason: 'session_not_found',
        })
      }

      const accepted = await this.state.executionBridge.resolvePermission(
        session,
        requestId,
        decision === 'allow'
          ? { behavior: 'allow', resolvedBy: providerUserId }
          : { behavior: 'deny', message: 'Denied from Feishu action', resolvedBy: providerUserId },
      )

      return this.finishAction(recordId, existing?.firstSeenAt ?? now, now, {
        accepted,
        idempotencyKey,
        sessionId,
        requestId,
        ignoredReason: accepted ? undefined : 'bridge_declined_permission_resolution',
      })
    }

    if (actionKind === 'open_session' || actionKind === 'resume_session') {
      const binding = this.ensureChannelBinding({
        providerUserId,
        tenantScope: parsed.tenant_key ?? '',
        title: `Feishu ${providerUserId}`,
        mode: actionKind === 'resume_session' ? 'resume_or_create' : 'create',
      })

      return this.finishAction(recordId, existing?.firstSeenAt ?? now, now, {
        accepted: true,
        idempotencyKey,
        sessionId: binding.sessionId,
      })
    }

    return this.finishAction(recordId, existing?.firstSeenAt ?? now, now, {
      accepted: true,
      idempotencyKey,
      ignoredReason: 'unsupported_action',
    })
  }

  private async submitInboundText(input: {
    providerUserId: string
    tenantScope: string
    text: string
    title: string
    sourceMessageId?: string
  }): Promise<{ sessionId: string; requestId: string }> {
    const binding = this.ensureChannelBinding({
      providerUserId: input.providerUserId,
      tenantScope: input.tenantScope,
      title: input.title,
      mode: 'resume_or_create',
    })
    const session = this.state.repositories.sessions.findById(binding.sessionId)
    if (!session) {
      throw new Error(`Bound session ${binding.sessionId} was not found`)
    }

    const requestId = `req_${randomUUID()}`
    await this.state.executionBridge.submitInput({
      session,
      prompt: input.text,
      requestId,
    })

    return { sessionId: session.id, requestId }
  }

  private ensureChannelBinding(input: {
    providerUserId: string
    tenantScope: string
    title: string
    mode: 'create' | 'resume_or_create'
  }): { identityId: string; sessionId: string } {
    const now = new Date().toISOString()
    const existingIdentity = this.state.repositories.channelIdentities.findByProviderIdentity({
      provider: 'feishu',
      providerUserId: input.providerUserId,
      tenantScope: input.tenantScope,
    })

    const identityId = existingIdentity?.id ?? `chid_${randomUUID()}`
    const ownerUserId = existingIdentity?.userId ?? `feishu:${input.tenantScope}:${input.providerUserId}`
    const identity = {
      id: identityId,
      userId: ownerUserId,
      provider: 'feishu' as const,
      providerUserId: input.providerUserId,
      tenantScope: input.tenantScope,
      tenantId: input.tenantScope || undefined,
      createdAt: existingIdentity?.createdAt ?? now,
      updatedAt: now,
    }

    this.state.repositories.channelIdentities.upsert(identity)

    const existingBinding =
      input.mode === 'resume_or_create'
        ? this.state.repositories.sessionBindings.findPrimaryByIdentity(identityId)
        : null
    if (existingBinding) {
      return {
        identityId,
        sessionId: existingBinding.sessionId,
      }
    }

    const sessionId = `sess_${randomUUID()}`
    this.state.db.transaction(() => {
      this.state.repositories.sessions.insert({
        id: sessionId,
        title: input.title,
        status: 'waiting_input',
        ownerUserId,
        sourceChannel: 'feishu',
        executionSessionRef: randomUUID(),
        createdAt: now,
        updatedAt: now,
        lastActiveAt: now,
      })
      this.state.repositories.sessionBindings.insert({
        id: `bind_${randomUUID()}`,
        sessionId,
        channelIdentityId: identityId,
        userId: ownerUserId,
        bindingType: 'owner',
        isPrimary: true,
        createdAt: now,
        updatedAt: now,
      })
    })()

    return {
      identityId,
      sessionId,
    }
  }

  private finishAction(
    recordId: string,
    firstSeenAt: string,
    now: string,
    response: FeishuActionResponse,
  ): FeishuActionResponse {
    const status = response.ignoredReason ? 'ignored' : 'processed'
    this.state.repositories.idempotency.upsert({
      id: recordId,
      provider: 'feishu',
      idempotencyKey: response.idempotencyKey,
      keySource: 'token',
      eventType: 'interactive.action',
      status,
      firstSeenAt,
      lastSeenAt: now,
      responseSnapshotJson: JSON.stringify(response),
    })
    return response
  }

  private markIdempotencyProcessed(
    recordId: string,
    input: {
      idempotencyKey: string
      hash: string
      now: string
      eventType: string
      ignoredReason: string
    },
  ): void {
    this.state.repositories.idempotency.upsert({
      id: recordId,
      provider: 'feishu',
      idempotencyKey: input.idempotencyKey,
      payloadHash: input.hash,
      keySource: 'payload_hash_derived',
      eventType: input.eventType,
      status: 'ignored',
      firstSeenAt: input.now,
      lastSeenAt: input.now,
      responseSnapshotJson: JSON.stringify({ ignoredReason: input.ignoredReason }),
    })
  }
}
