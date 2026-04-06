import {
  createFeishuStreamingCardDefinition,
  type RenderFeishuSessionCardInput,
} from './feishuCardRenderer.js'

type FeishuSdkCardClient = {
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

type FeishuStreamingCardAudit = (eventType: string, payload: Record<string, unknown>) => void

export type FeishuStreamingCardOptions = {
  client: FeishuSdkCardClient
  providerUserId: string
  audit?: FeishuStreamingCardAudit
  sessionId?: string
  requestId?: string
}

const CONTENT_ELEMENT_ID = 'content'

export class FeishuStreamingCardSession {
  private cardId?: string
  private messageId?: string
  private sequence = 0
  private lastContent = ''
  private readonly audit?: FeishuStreamingCardAudit

  constructor(private readonly options: FeishuStreamingCardOptions) {
    this.audit = options.audit
  }

  get currentMessageId(): string | undefined {
    return this.messageId
  }

  get currentContent(): string {
    return this.lastContent
  }

  async start(input: RenderFeishuSessionCardInput): Promise<string> {
    const initialContent = input.bodyMarkdown?.trim() || input.summary
    this.lastContent = initialContent

    const cardJson = createFeishuStreamingCardDefinition({
      ...input,
      bodyMarkdown: initialContent,
    })

    const createResult = await this.options.client.cardkit.v1.card.create({
      data: {
        type: 'card_json',
        data: JSON.stringify(cardJson),
      },
    })

    this.cardId = createResult.data?.card_id
    if (!this.cardId) {
      throw new Error('Failed to create Feishu streaming card')
    }

    const messageResult = await this.options.client.im.message.create({
      params: {
        receive_id_type: 'open_id',
      },
      data: {
        receive_id: this.options.providerUserId,
        msg_type: 'interactive',
        content: JSON.stringify({
          type: 'card',
          data: {
            card_id: this.cardId,
          },
        }),
      },
    })

    this.messageId = messageResult.data?.message_id
    this.audit?.('feishu.outbound.card.create', {
      mode: 'streaming',
      providerUserId: this.options.providerUserId,
      sessionId: this.options.sessionId,
      requestId: this.options.requestId,
      messageId: this.messageId,
      cardId: this.cardId,
    })

    return this.messageId ?? ''
  }

  async update(fullText: string): Promise<void> {
    if (!this.cardId || !fullText.trim() || fullText === this.lastContent) {
      return
    }

    this.sequence += 1
    this.lastContent = fullText
    await this.options.client.cardkit.v1.cardElement.content({
      path: {
        card_id: this.cardId,
        element_id: CONTENT_ELEMENT_ID,
      },
      data: {
        content: fullText,
        sequence: this.sequence,
        uuid: `content_${this.cardId}_${this.sequence}`,
      },
    })

    this.audit?.('feishu.outbound.card.update', {
      mode: 'streaming',
      providerUserId: this.options.providerUserId,
      sessionId: this.options.sessionId,
      requestId: this.options.requestId,
      messageId: this.messageId,
      cardId: this.cardId,
      sequence: this.sequence,
    })
  }

  async close(summary?: string, finalText?: string): Promise<void> {
    if (!this.cardId) {
      return
    }

    if (finalText?.trim() && finalText !== this.lastContent) {
      await this.update(finalText)
    }

    this.sequence += 1
    await this.options.client.cardkit.v1.card.settings({
      path: {
        card_id: this.cardId,
      },
      data: {
        settings: JSON.stringify({
          config: {
            streaming_mode: false,
            summary: {
              content: summary || (this.lastContent.slice(0, 60) || 'Done'),
            },
          },
        }),
        sequence: this.sequence,
        uuid: `settings_${this.cardId}_${this.sequence}`,
      },
    })

    this.audit?.('feishu.outbound.card.update', {
      mode: 'streaming-close',
      providerUserId: this.options.providerUserId,
      sessionId: this.options.sessionId,
      requestId: this.options.requestId,
      messageId: this.messageId,
      cardId: this.cardId,
      sequence: this.sequence,
      summary,
    })
  }
}
