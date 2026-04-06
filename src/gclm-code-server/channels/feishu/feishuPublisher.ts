import { randomUUID } from 'crypto'
import type { AuditRepository } from '../../audit/auditRepository.js'
import type { GclmCodeServerFeishuEnv } from '../../config/env.js'
import {
  renderFeishuSessionCard,
  type FeishuCardAction,
  type RenderFeishuSessionCardInput,
} from './feishuCardRenderer.js'

type FeishuAccessTokenResponse = {
  tenant_access_token?: string
  expire?: number
  code?: number
  msg?: string
}

type FeishuSendMessageResponse = {
  code?: number
  msg?: string
  data?: {
    message_id?: string
  }
}

export type FeishuPublisherDeps = {
  config: GclmCodeServerFeishuEnv
  audit: AuditRepository
  fetchImpl?: typeof fetch
}

export type FeishuStatusReceiptInput = {
  providerUserId: string
  tenantScope?: string
  sessionId: string
  requestId?: string
  stage:
    | 'accepted'
    | 'permission_pending'
    | 'permission_resolved'
    | 'session_ready'
    | 'running'
    | 'completed'
    | 'failed'
    | 'interrupted'
  summary: string
  bodyMarkdown?: string
  existingMessageId?: string
  actions?: FeishuCardAction[]
}

export type FeishuCardPublishResult = {
  ok: boolean
  messageId?: string
}

function isFeishuConfigReady(config: GclmCodeServerFeishuEnv): boolean {
  return Boolean(config.enabled && config.appId && config.appSecret)
}

export class FeishuPublisher {
  private readonly fetchImpl: typeof fetch
  private accessTokenCache:
    | {
        token: string
        expiresAt: number
      }
    | undefined

  constructor(private readonly deps: FeishuPublisherDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch
  }

  isEnabled(): boolean {
    return isFeishuConfigReady(this.deps.config)
  }

  async sendTextMessage(input: {
    providerUserId: string
    text: string
    sessionId?: string
    requestId?: string
  }): Promise<boolean> {
    if (!this.isEnabled()) {
      return false
    }

    const tenantAccessToken = await this.getTenantAccessToken()
    const response = await this.fetchImpl(
      `${this.deps.config.baseUrl}/open-apis/im/v1/messages?receive_id_type=open_id`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${tenantAccessToken}`,
        },
        body: JSON.stringify({
          receive_id: input.providerUserId,
          msg_type: 'text',
          content: JSON.stringify({ text: input.text }),
        }),
      },
    )

    const json = (await response.json()) as FeishuSendMessageResponse
    const ok = response.ok && (json.code === undefined || json.code === 0)

    this.deps.audit.insert({
      id: `audit_${randomUUID()}`,
      eventType: 'feishu.outbound.text',
      sessionId: input.sessionId,
      actorType: 'channel',
      actorId: input.providerUserId,
      channel: 'feishu',
      requestId: input.requestId,
      payloadJson: JSON.stringify({
        text: input.text,
        ok,
        response: json,
      }),
      createdAt: new Date().toISOString(),
    })

    return ok
  }

  async sendInteractiveCard(input: {
    providerUserId: string
    card: string
    sessionId?: string
    requestId?: string
  }): Promise<FeishuCardPublishResult> {
    return this.createMessage({
      providerUserId: input.providerUserId,
      msgType: 'interactive',
      content: input.card,
      sessionId: input.sessionId,
      requestId: input.requestId,
      auditEventType: 'feishu.outbound.card.create',
    })
  }

  async updateInteractiveCard(input: {
    messageId: string
    card: string
    providerUserId: string
    sessionId?: string
    requestId?: string
  }): Promise<FeishuCardPublishResult> {
    if (!this.isEnabled()) {
      return { ok: false }
    }

    const tenantAccessToken = await this.getTenantAccessToken()
    const response = await this.fetchImpl(
      `${this.deps.config.baseUrl}/open-apis/im/v1/messages/${input.messageId}`,
      {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${tenantAccessToken}`,
        },
        body: JSON.stringify({
          content: input.card,
        }),
      },
    )

    const json = (await response.json()) as FeishuSendMessageResponse
    const ok = response.ok && (json.code === undefined || json.code === 0)

    this.deps.audit.insert({
      id: `audit_${randomUUID()}`,
      eventType: 'feishu.outbound.card.update',
      sessionId: input.sessionId,
      actorType: 'channel',
      actorId: input.providerUserId,
      channel: 'feishu',
      requestId: input.requestId,
      payloadJson: JSON.stringify({
        messageId: input.messageId,
        ok,
        response: json,
      }),
      createdAt: new Date().toISOString(),
    })

    return {
      ok,
      messageId: input.messageId,
    }
  }

  async sendStatusReceipt(input: FeishuStatusReceiptInput): Promise<FeishuCardPublishResult> {
    return this.upsertSessionCard({
      providerUserId: input.providerUserId,
      existingMessageId: input.existingMessageId,
      card: {
        title: 'gclm-code-server',
        stage: input.stage,
        summary: input.summary,
        sessionId: input.sessionId,
        requestId: input.requestId,
        updatedAt: new Date().toISOString(),
        bodyMarkdown: input.bodyMarkdown,
        actions: input.actions,
      },
      sessionId: input.sessionId,
      requestId: input.requestId,
    })
  }

  async upsertSessionCard(input: {
    providerUserId: string
    existingMessageId?: string
    card: RenderFeishuSessionCardInput
    sessionId?: string
    requestId?: string
  }): Promise<FeishuCardPublishResult> {
    const card = renderFeishuSessionCard(input.card)
    if (input.existingMessageId) {
      const updated = await this.updateInteractiveCard({
        messageId: input.existingMessageId,
        card,
        providerUserId: input.providerUserId,
        sessionId: input.sessionId,
        requestId: input.requestId,
      })
      if (updated.ok) {
        return updated
      }
    }

    return this.sendInteractiveCard({
      providerUserId: input.providerUserId,
      card,
      sessionId: input.sessionId,
      requestId: input.requestId,
    })
  }

  private async getTenantAccessToken(): Promise<string> {
    const now = Date.now()
    if (this.accessTokenCache && this.accessTokenCache.expiresAt > now + 30_000) {
      return this.accessTokenCache.token
    }

    const response = await this.fetchImpl(
      `${this.deps.config.baseUrl}/open-apis/auth/v3/tenant_access_token/internal`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
        },
        body: JSON.stringify({
          app_id: this.deps.config.appId,
          app_secret: this.deps.config.appSecret,
        }),
      },
    )

    const json = (await response.json()) as FeishuAccessTokenResponse
    if (!response.ok || !json.tenant_access_token) {
      throw new Error(
        `Failed to fetch Feishu tenant access token: ${json.msg ?? response.statusText}`,
      )
    }

    this.accessTokenCache = {
      token: json.tenant_access_token,
      expiresAt: now + Math.max((json.expire ?? 7200) - 60, 60) * 1000,
    }

    return json.tenant_access_token
  }

  private async createMessage(input: {
    providerUserId: string
    msgType: 'text' | 'interactive'
    content: string
    sessionId?: string
    requestId?: string
    auditEventType: string
  }): Promise<FeishuCardPublishResult> {
    if (!this.isEnabled()) {
      return { ok: false }
    }

    const tenantAccessToken = await this.getTenantAccessToken()
    const response = await this.fetchImpl(
      `${this.deps.config.baseUrl}/open-apis/im/v1/messages?receive_id_type=open_id`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          Authorization: `Bearer ${tenantAccessToken}`,
        },
        body: JSON.stringify({
          receive_id: input.providerUserId,
          msg_type: input.msgType,
          content: input.content,
        }),
      },
    )

    const json = (await response.json()) as FeishuSendMessageResponse
    const ok = response.ok && (json.code === undefined || json.code === 0)
    const messageId = json.data?.message_id

    this.deps.audit.insert({
      id: `audit_${randomUUID()}`,
      eventType: input.auditEventType,
      sessionId: input.sessionId,
      actorType: 'channel',
      actorId: input.providerUserId,
      channel: 'feishu',
      requestId: input.requestId,
      payloadJson: JSON.stringify({
        msgType: input.msgType,
        messageId,
        ok,
        response: json,
      }),
      createdAt: new Date().toISOString(),
    })

    return {
      ok,
      messageId,
    }
  }
}
