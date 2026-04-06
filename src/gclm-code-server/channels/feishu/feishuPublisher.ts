import { randomUUID } from 'crypto'
import type { AuditRepository } from '../../audit/auditRepository.js'
import type { GclmCodeServerFeishuEnv } from '../../config/env.js'
import {
  renderFeishuSessionCard,
  type FeishuCardAction,
  type RenderFeishuSessionCardInput,
} from './feishuCardRenderer.js'
import { FeishuStreamingCardSession } from './feishuStreamingCard.js'

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
  sdkFactory?: () => Promise<{
    Client: new (options: {
      appId: string
      appSecret: string
    }) => {
      cardkit: {
        v1: {
          card: {
            create(input: {
              data: { type: 'card_json'; data: string }
            }): Promise<{ data?: { card_id?: string } }>
            settings(input: {
              path: { card_id: string }
              data: { settings: string; sequence: number; uuid: string }
            }): Promise<unknown>
          }
          cardElement: {
            content(input: {
              path: { card_id: string; element_id: string }
              data: { content: string; sequence: number; uuid: string }
            }): Promise<unknown>
          }
        }
      }
      im: {
        message: {
          create(input: {
            params: { receive_id_type: 'open_id' }
            data: {
              receive_id: string
              msg_type: 'interactive'
              content: string
            }
          }): Promise<{ data?: { message_id?: string } }>
        }
      }
    }
  }>
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
  private readonly sdkFactory: NonNullable<FeishuPublisherDeps['sdkFactory']>
  private accessTokenCache:
    | {
        token: string
        expiresAt: number
      }
    | undefined
  private sdkClientPromise:
    | Promise<{
        cardkit: {
          v1: {
            card: {
              create(input: {
                data: { type: 'card_json'; data: string }
              }): Promise<{ data?: { card_id?: string } }>
              settings(input: {
                path: { card_id: string }
                data: { settings: string; sequence: number; uuid: string }
              }): Promise<unknown>
            }
            cardElement: {
              content(input: {
                path: { card_id: string; element_id: string }
                data: { content: string; sequence: number; uuid: string }
              }): Promise<unknown>
            }
          }
        }
        im: {
          message: {
            create(input: {
              params: { receive_id_type: 'open_id' }
              data: {
                receive_id: string
                msg_type: 'interactive'
                content: string
              }
            }): Promise<{ data?: { message_id?: string } }>
          }
        }
      }>
    | undefined

  constructor(private readonly deps: FeishuPublisherDeps) {
    this.fetchImpl = deps.fetchImpl ?? fetch
    this.sdkFactory =
      deps.sdkFactory ??
      (async () => {
        return await import('@larksuiteoapi/node-sdk')
      })
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

  async createStreamingCardSession(input: {
    providerUserId: string
    sessionId?: string
    requestId?: string
    card: RenderFeishuSessionCardInput
  }): Promise<FeishuStreamingCardSession | null> {
    if (!this.isEnabled()) {
      return null
    }

    const client = await this.getSdkClient()
    const session = new FeishuStreamingCardSession({
      client,
      providerUserId: input.providerUserId,
      sessionId: input.sessionId,
      requestId: input.requestId,
      audit: (eventType, payload) => {
        this.insertAudit({
          eventType,
          actorId: input.providerUserId,
          sessionId: input.sessionId,
          requestId: input.requestId,
          payload,
        })
      },
    })
    await session.start(input.card)
    return session
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

  private async getSdkClient(): Promise<{
    cardkit: {
      v1: {
        card: {
          create(input: {
            data: { type: 'card_json'; data: string }
          }): Promise<{ data?: { card_id?: string } }>
          settings(input: {
            path: { card_id: string }
            data: { settings: string; sequence: number; uuid: string }
          }): Promise<unknown>
        }
        cardElement: {
          content(input: {
            path: { card_id: string; element_id: string }
            data: { content: string; sequence: number; uuid: string }
          }): Promise<unknown>
        }
      }
    }
    im: {
      message: {
        create(input: {
          params: { receive_id_type: 'open_id' }
          data: {
            receive_id: string
            msg_type: 'interactive'
            content: string
          }
        }): Promise<{ data?: { message_id?: string } }>
      }
    }
  }> {
    if (!this.sdkClientPromise) {
      this.sdkClientPromise = this.sdkFactory().then(sdk => {
        return new sdk.Client({
          appId: this.deps.config.appId ?? '',
          appSecret: this.deps.config.appSecret ?? '',
        })
      })
    }

    return await this.sdkClientPromise
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

    this.insertAudit({
      eventType: input.auditEventType,
      actorId: input.providerUserId,
      sessionId: input.sessionId,
      requestId: input.requestId,
      payload: {
        msgType: input.msgType,
        messageId,
        ok,
        response: json,
      },
    })

    return {
      ok,
      messageId,
    }
  }

  private insertAudit(input: {
    eventType: string
    actorId: string
    sessionId?: string
    requestId?: string
    payload: Record<string, unknown>
  }): void {
    this.deps.audit.insert({
      id: `audit_${randomUUID()}`,
      eventType: input.eventType,
      sessionId: input.sessionId,
      actorType: 'channel',
      actorId: input.actorId,
      channel: 'feishu',
      requestId: input.requestId,
      payloadJson: JSON.stringify(input.payload),
      createdAt: new Date().toISOString(),
    })
  }
}
