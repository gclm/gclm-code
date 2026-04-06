import type { GclmCodeServerAppState } from '../../app/types.js'
import type { PermissionRequestRecord } from '../../permissions/types.js'
import type { StreamEvent } from '../../transport/streamHub.js'
import type { FeishuStreamingCardSession } from './feishuStreamingCard.js'

function truncateText(text: string, maxLength = 1800): string {
  if (text.length <= maxLength) {
    return text
  }

  return `${text.slice(0, Math.max(maxLength - 1, 1))}…`
}

function formatPermissionSummary(record: PermissionRequestRecord): string {
  const input = truncateText(record.inputJson, 400)
  return [
    '检测到工具权限请求。',
    `Tool: ${record.toolName}`,
    `Request: ${record.id}`,
    `Input: ${input}`,
    '当前桥接尚未稳定支持从飞书直接回写权限决策，请改用 Web Console 或本地终端继续。',
  ].join('\n')
}

export class FeishuSessionRelay {
  private readonly subscriptions = new Map<string, () => void>()
  private readonly cards = new Map<
    string,
    { statusMessageId?: string; streaming?: FeishuStreamingCardSession }
  >()

  constructor(private readonly state: GclmCodeServerAppState) {}

  ensureSubscribedForSession(sessionId: string): void {
    if (this.subscriptions.has(sessionId)) {
      return
    }

    const session = this.state.repositories.sessions.findById(sessionId)
    if (!session || session.sourceChannel !== 'feishu') {
      return
    }

    const identity = this.state.repositories.channelIdentities.findFirstByUserIdAndProvider({
      userId: session.ownerUserId,
      provider: 'feishu',
    })
    if (!identity?.providerUserId) {
      return
    }

    const unsubscribe = this.state.streamHub.subscribe(sessionId, {
      id: `feishu-relay:${sessionId}`,
      send: event => {
        void this.forwardEvent({
          sessionId,
          providerUserId: identity.providerUserId,
          tenantScope: identity.tenantScope,
          event,
        })
      },
    })

    this.subscriptions.set(sessionId, () => {
      unsubscribe()
      this.subscriptions.delete(sessionId)
    })
  }

  stop(): void {
    for (const unsubscribe of this.subscriptions.values()) {
      unsubscribe()
    }
    this.subscriptions.clear()
  }

  private getCardState(sessionId: string): {
    statusMessageId?: string
    streaming?: FeishuStreamingCardSession
  } {
    return this.cards.get(sessionId) ?? {}
  }

  private setStatusMessageId(sessionId: string, messageId?: string): void {
    const current = this.getCardState(sessionId)
    this.cards.set(sessionId, {
      ...current,
      statusMessageId: messageId ?? current.statusMessageId,
    })
  }

  private setStreamingCard(
    sessionId: string,
    streaming?: FeishuStreamingCardSession,
  ): void {
    const current = this.getCardState(sessionId)
    this.cards.set(sessionId, {
      ...current,
      streaming,
    })
  }

  private async forwardEvent(input: {
    sessionId: string
    providerUserId: string
    tenantScope: string
    event: StreamEvent
  }): Promise<void> {
    const { event } = input
    if (event.type === 'session.updated') {
      const data = this.asRecord(event.data)
      if (data?.status !== 'running') {
        return
      }

      const current = this.getCardState(input.sessionId)
      if (current.streaming) {
        return
      }

      const streaming = await this.state.channels.feishuPublisher.createStreamingCardSession({
        providerUserId: input.providerUserId,
        sessionId: input.sessionId,
        card: {
          title: 'gclm-code-server',
          stage: 'running',
          summary: '正在生成本轮输出。',
          sessionId: input.sessionId,
          updatedAt: new Date().toISOString(),
          bodyMarkdown: 'Thinking...',
          actions: [
            {
              label: '中断执行',
              action: 'interrupt_session',
              style: 'danger',
              value: {
                sessionId: input.sessionId,
              },
            },
          ],
        },
      })
      this.setStreamingCard(input.sessionId, streaming ?? undefined)
      return
    }

    if (event.type === 'message.completed') {
      const data = this.asRecord(event.data)
      if (data?.role !== 'assistant' || typeof data.text !== 'string' || !data.text.trim()) {
        return
      }

      const current = this.getCardState(input.sessionId)
      let streaming = current.streaming
      if (!streaming) {
        streaming = await this.state.channels.feishuPublisher.createStreamingCardSession({
          providerUserId: input.providerUserId,
          sessionId: input.sessionId,
          card: {
            title: 'gclm-code-server',
            stage: 'running',
            summary: '已收到最新 assistant 输出。',
            sessionId: input.sessionId,
            updatedAt: new Date().toISOString(),
            bodyMarkdown: data.text,
            actions: [
              {
                label: '中断执行',
                action: 'interrupt_session',
                style: 'danger',
                value: {
                  sessionId: input.sessionId,
                },
              },
            ],
          },
        })
        this.setStreamingCard(input.sessionId, streaming ?? undefined)
        return
      }
      await streaming.update(data.text)
      return
    }

    if (event.type === 'permission.requested') {
      const data = this.asRecord(event.data)
      if (!data) {
        return
      }

      const card = this.getCardState(input.sessionId)
      const result = await this.state.channels.feishuPublisher.sendStatusReceipt({
        providerUserId: input.providerUserId,
        tenantScope: input.tenantScope,
        sessionId: input.sessionId,
        requestId: typeof data.id === 'string' ? data.id : undefined,
        stage: 'permission_pending',
        summary: formatPermissionSummary(data as PermissionRequestRecord),
        existingMessageId: card.statusMessageId,
      })
      if (result.messageId) {
        this.setStatusMessageId(input.sessionId, result.messageId)
      }
      return
    }

    if (event.type === 'permission.cancelled') {
      const data = this.asRecord(event.data)
      const result = await this.state.channels.feishuPublisher.sendStatusReceipt({
        providerUserId: input.providerUserId,
        tenantScope: input.tenantScope,
        sessionId: input.sessionId,
        requestId: typeof data?.requestId === 'string' ? data.requestId : undefined,
        stage: 'permission_resolved',
        summary: '权限请求已取消，本轮执行会继续或结束。',
        existingMessageId: this.getCardState(input.sessionId).statusMessageId,
      })
      if (result.messageId) {
        this.setStatusMessageId(input.sessionId, result.messageId)
      }
      return
    }

    if (event.type === 'session.execution.completed') {
      const data = this.asRecord(event.data)
      if (!data) {
        return
      }

      const current = this.getCardState(input.sessionId)
      if (current.streaming) {
        await current.streaming.close(
          data.status === 'failed' ? '执行失败' : '输出完成',
        )
        this.setStreamingCard(input.sessionId, undefined)
      }

      if (data.status === 'waiting_input') {
        return
      }

      const result = await this.state.channels.feishuPublisher.sendStatusReceipt({
        providerUserId: input.providerUserId,
        tenantScope: input.tenantScope,
        sessionId: input.sessionId,
        requestId: typeof data.requestId === 'string' ? data.requestId : undefined,
        stage: data.status === 'failed' ? 'failed' : 'completed',
        summary:
          data.status === 'failed'
            ? '本轮执行失败，请查看 Web Console 或本地日志继续排查。'
            : `本轮执行已结束，状态：${String(data.status)}`,
        existingMessageId: current.statusMessageId,
        actions:
          data.status === 'failed'
            ? [
                {
                  label: '继续会话',
                  action: 'resume_session',
                  style: 'primary',
                  value: {
                    sessionId: input.sessionId,
                  },
                },
              ]
            : undefined,
      })
      if (result.messageId) {
        this.setStatusMessageId(input.sessionId, result.messageId)
      }
      return
    }

    if (event.type === 'session.interrupted') {
      const data = this.asRecord(event.data)
      const current = this.getCardState(input.sessionId)
      if (current.streaming) {
        await current.streaming.close('执行已中断', 'Interrupted by user.')
        this.setStreamingCard(input.sessionId, undefined)
      }
      const result = await this.state.channels.feishuPublisher.sendStatusReceipt({
        providerUserId: input.providerUserId,
        tenantScope: input.tenantScope,
        sessionId: input.sessionId,
        requestId: typeof data?.requestId === 'string' ? data.requestId : undefined,
        stage: 'interrupted',
        summary: '本轮执行已被中断。',
        existingMessageId: current.statusMessageId,
        actions: [
          {
            label: '继续会话',
            action: 'resume_session',
            style: 'primary',
            value: {
              sessionId: input.sessionId,
            },
          },
        ],
      })
      if (result.messageId) {
        this.setStatusMessageId(input.sessionId, result.messageId)
      }
    }
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
  }
}
