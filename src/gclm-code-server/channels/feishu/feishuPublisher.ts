import { randomUUID } from 'crypto'
import type { AuditRepository } from '../../audit/auditRepository.js'
import type { GclmCodeServerFeishuEnv } from '../../config/env.js'

type FeishuAccessTokenResponse = {
  tenant_access_token?: string
  expire?: number
  code?: number
  msg?: string
}

type FeishuSendMessageResponse = {
  code?: number
  msg?: string
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
  stage: 'accepted' | 'permission_pending' | 'permission_resolved' | 'session_ready'
  summary: string
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

  async sendStatusReceipt(input: FeishuStatusReceiptInput): Promise<boolean> {
    return this.sendTextMessage({
      providerUserId: input.providerUserId,
      sessionId: input.sessionId,
      requestId: input.requestId,
      text: `[${input.stage}] ${input.summary}\nSession: ${input.sessionId}${
        input.requestId ? `\nRequest: ${input.requestId}` : ''
      }`,
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
}
