import type { GclmCodeServerAppState } from '../../app/types.js'
import type { PermissionRequestRecord } from '../../permissions/types.js'
import type { StreamEvent } from '../../transport/streamHub.js'

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

  private async forwardEvent(input: {
    sessionId: string
    providerUserId: string
    tenantScope: string
    event: StreamEvent
  }): Promise<void> {
    const { event } = input
    if (event.type === 'message.completed') {
      const data = this.asRecord(event.data)
      if (data?.role !== 'assistant' || typeof data.text !== 'string' || !data.text.trim()) {
        return
      }

      await this.state.channels.feishuPublisher.sendTextMessage({
        providerUserId: input.providerUserId,
        sessionId: input.sessionId,
        text: truncateText(data.text),
      })
      return
    }

    if (event.type === 'permission.requested') {
      const data = this.asRecord(event.data)
      if (!data) {
        return
      }

      await this.state.channels.feishuPublisher.sendStatusReceipt({
        providerUserId: input.providerUserId,
        tenantScope: input.tenantScope,
        sessionId: input.sessionId,
        requestId: typeof data.id === 'string' ? data.id : undefined,
        stage: 'permission_pending',
        summary: formatPermissionSummary(data as PermissionRequestRecord),
      })
      return
    }

    if (event.type === 'permission.cancelled') {
      const data = this.asRecord(event.data)
      await this.state.channels.feishuPublisher.sendStatusReceipt({
        providerUserId: input.providerUserId,
        tenantScope: input.tenantScope,
        sessionId: input.sessionId,
        requestId: typeof data?.requestId === 'string' ? data.requestId : undefined,
        stage: 'permission_resolved',
        summary: '权限请求已取消，本轮执行会继续或结束。',
      })
      return
    }

    if (event.type === 'session.execution.completed') {
      const data = this.asRecord(event.data)
      if (!data || data.status === 'waiting_input') {
        return
      }

      await this.state.channels.feishuPublisher.sendStatusReceipt({
        providerUserId: input.providerUserId,
        tenantScope: input.tenantScope,
        sessionId: input.sessionId,
        requestId: typeof data.requestId === 'string' ? data.requestId : undefined,
        stage: 'accepted',
        summary:
          data.status === 'failed'
            ? '本轮执行失败，请查看 Web Console 或本地日志继续排查。'
            : `本轮执行已结束，状态：${String(data.status)}`,
      })
      return
    }

    if (event.type === 'session.interrupted') {
      const data = this.asRecord(event.data)
      await this.state.channels.feishuPublisher.sendStatusReceipt({
        providerUserId: input.providerUserId,
        tenantScope: input.tenantScope,
        sessionId: input.sessionId,
        requestId: typeof data?.requestId === 'string' ? data.requestId : undefined,
        stage: 'accepted',
        summary: '本轮执行已被中断。',
      })
    }
  }

  private asRecord(value: unknown): Record<string, unknown> | null {
    return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
  }
}
