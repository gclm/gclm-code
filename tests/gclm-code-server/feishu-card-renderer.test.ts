import { describe, expect, test } from 'bun:test'
import {
  buildFeishuCard,
  createFeishuStreamingCardDefinition,
  renderFeishuSessionCard,
} from '../../src/gclm-code-server/channels/feishu/feishuCardRenderer.js'

describe('feishuCardRenderer', () => {
  test('buildFeishuCard keeps tlive-style schema envelope', () => {
    const card = JSON.parse(
      buildFeishuCard({
        header: {
          template: 'blue',
          title: 'gclm-code-server',
        },
        elements: [{ tag: 'markdown', content: 'hello' }],
      }),
    ) as Record<string, unknown>

    expect(card.schema).toBe('2.0')
    expect((card.config as Record<string, unknown>).wide_screen_mode).toBe(true)
    expect((card.body as Record<string, unknown>).elements).toBeArray()
  })

  test('renderFeishuSessionCard renders summary, facts and actions', () => {
    const card = JSON.parse(
      renderFeishuSessionCard({
        title: 'gclm-code-server',
        stage: 'permission_pending',
        summary: '检测到工具权限请求',
        sessionId: 'sess_123',
        requestId: 'req_123',
        updatedAt: '2026-04-07T00:00:00.000Z',
        bodyMarkdown: '需要你确认是否继续执行。',
        actions: [
          {
            label: '中断执行',
            action: 'interrupt_session',
            style: 'danger',
            value: {
              sessionId: 'sess_123',
            },
          },
        ],
      }),
    ) as {
      config: Record<string, unknown>
      body: { elements: Array<Record<string, unknown>> }
      header: { template: string; title: { content: string } }
    }

    expect(card.header.template).toBe('orange')
    expect(card.header.title.content).toBe('gclm-code-server')
    expect(card.config.summary).toEqual({
      content: '等待权限 · 检测到工具权限请求',
    })
    expect(card.body.elements[0]?.tag).toBe('markdown')
    expect(card.body.elements[1]?.tag).toBe('column_set')
    expect(JSON.stringify(card.body.elements)).toContain('sess_123')
    expect(JSON.stringify(card.body.elements)).toContain('interrupt_session')
  })

  test('createFeishuStreamingCardDefinition enables cardkit streaming mode', () => {
    const card = createFeishuStreamingCardDefinition({
      title: 'gclm-code-server',
      stage: 'running',
      summary: '正在生成',
      sessionId: 'sess_stream_1',
      bodyMarkdown: 'Thinking...',
      actions: [
        {
          label: '中断执行',
          action: 'interrupt_session',
          style: 'danger',
          value: {
            sessionId: 'sess_stream_1',
          },
        },
      ],
    }) as {
      config: Record<string, unknown>
      body: { elements: Array<Record<string, unknown>> }
    }

    expect(card.config.streaming_mode).toBe(true)
    expect(card.body.elements[0]?.element_id).toBe('content')
    expect(JSON.stringify(card.body.elements)).toContain('interrupt_session')
  })
})
