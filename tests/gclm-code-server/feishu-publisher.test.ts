import { describe, expect, test } from 'bun:test'
import { createSqliteDatabase } from '../../src/gclm-code-server/db/sqlite.js'
import { runMigrations } from '../../src/gclm-code-server/db/migrationRunner.js'
import { AuditRepository } from '../../src/gclm-code-server/audit/auditRepository.js'
import { FeishuPublisher } from '../../src/gclm-code-server/channels/feishu/feishuPublisher.js'
import { SessionRepository } from '../../src/gclm-code-server/sessions/sessionRepository.js'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

describe('FeishuPublisher', () => {
  test('fetches tenant token once and sends text receipt', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gclm-code-server-feishu-publisher-'))
    try {
      const db = createSqliteDatabase({
        path: join(dir, 'server.db'),
        busyTimeoutMs: 250,
      })
      runMigrations(db, join(import.meta.dir, '../../src/gclm-code-server/db/migrations'))

      const calls: Array<{ url: string; body?: unknown }> = []
      const sessions = new SessionRepository(db)
      const now = new Date().toISOString()
      sessions.insert({
        id: 'sess_1',
        title: 'Feishu Publisher Test',
        status: 'waiting_input',
        ownerUserId: 'user_1',
        sourceChannel: 'feishu',
        executionSessionRef: 'exec_1',
        createdAt: now,
        updatedAt: now,
        lastActiveAt: now,
      })

      const publisher = new FeishuPublisher({
        config: {
          enabled: true,
          baseUrl: 'https://open.feishu.cn',
          appId: 'app_id',
          appSecret: 'app_secret',
          useLongConnection: true,
          bypassSignatureVerification: false,
        },
        audit: new AuditRepository(db),
        fetchImpl: async (input, init) => {
          const url = String(input)
          calls.push({
            url,
            body: init?.body ? JSON.parse(String(init.body)) : undefined,
          })

          if (url.includes('/auth/v3/tenant_access_token/internal')) {
            return new Response(
              JSON.stringify({ tenant_access_token: 'tenant_token', expire: 7200, code: 0 }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            )
          }

          return new Response(JSON.stringify({ code: 0, msg: 'ok' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        },
      })

      const ok = await publisher.sendStatusReceipt({
        providerUserId: 'ou_123',
        sessionId: 'sess_1',
        requestId: 'req_1',
        stage: 'accepted',
        summary: '已收到消息',
      })

      expect(ok.ok).toBe(true)
      expect(calls).toHaveLength(2)
      expect(calls[0]?.url).toContain('/auth/v3/tenant_access_token/internal')
      expect(calls[1]?.url).toContain('/open-apis/im/v1/messages')
      expect((calls[1]?.body as { msg_type?: string })?.msg_type).toBe('interactive')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('creates and updates a feishu cardkit streaming card session', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gclm-code-server-feishu-streaming-'))
    try {
      const db = createSqliteDatabase({
        path: join(dir, 'server.db'),
        busyTimeoutMs: 250,
      })
      runMigrations(db, join(import.meta.dir, '../../src/gclm-code-server/db/migrations'))

      const sdkCalls: string[] = []
      const publisher = new FeishuPublisher({
        config: {
          enabled: true,
          baseUrl: 'https://open.feishu.cn',
          appId: 'app_id',
          appSecret: 'app_secret',
          useLongConnection: true,
          bypassSignatureVerification: false,
        },
        audit: new AuditRepository(db),
        sdkFactory: async () => ({
          Client: class {
            cardkit = {
              v1: {
                card: {
                  create: async () => {
                    sdkCalls.push('card.create')
                    return { data: { card_id: 'card_1' } }
                  },
                  settings: async () => {
                    sdkCalls.push('card.settings')
                    return {}
                  },
                },
                cardElement: {
                  content: async () => {
                    sdkCalls.push('cardElement.content')
                    return {}
                  },
                },
              },
            }

            im = {
              message: {
                create: async () => {
                  sdkCalls.push('message.create')
                  return { data: { message_id: 'om_1' } }
                },
              },
            }
          },
        }),
      })

      const sessions = new SessionRepository(db)
      const now = new Date().toISOString()
      sessions.insert({
        id: 'sess_stream_1',
        title: 'Feishu Streaming Publisher Test',
        status: 'running',
        ownerUserId: 'user_stream_1',
        sourceChannel: 'feishu',
        executionSessionRef: 'exec_stream_1',
        createdAt: now,
        updatedAt: now,
        lastActiveAt: now,
      })

      const streaming = await publisher.createStreamingCardSession({
        providerUserId: 'ou_stream_1',
        sessionId: 'sess_stream_1',
        card: {
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
        },
      })

      expect(streaming).not.toBeNull()
      await streaming?.update('final answer')
      await streaming?.close('输出完成', 'final answer')
      expect(sdkCalls).toEqual(['card.create', 'message.create', 'cardElement.content', 'card.settings'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
