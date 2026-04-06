import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createSqliteDatabase } from '../../src/gclm-code-server/db/sqlite.js'
import { runMigrations } from '../../src/gclm-code-server/db/migrationRunner.js'
import { ChannelIdentityRepository } from '../../src/gclm-code-server/identity/channelIdentityRepository.js'
import { SessionRepository } from '../../src/gclm-code-server/sessions/sessionRepository.js'
import { SessionBindingRepository } from '../../src/gclm-code-server/sessions/sessionBindingRepository.js'
import { PermissionRepository } from '../../src/gclm-code-server/permissions/permissionRepository.js'
import { IdempotencyRepository } from '../../src/gclm-code-server/channels/shared/idempotencyRepository.js'
import { AuditRepository } from '../../src/gclm-code-server/audit/auditRepository.js'
import { StreamHub } from '../../src/gclm-code-server/transport/streamHub.js'
import { StreamInfoService } from '../../src/gclm-code-server/transport/streamInfoService.js'
import { FeishuPublisher } from '../../src/gclm-code-server/channels/feishu/feishuPublisher.js'
import { FeishuAdapter } from '../../src/gclm-code-server/channels/feishu/feishuAdapter.js'
import { FeishuSessionRelay } from '../../src/gclm-code-server/channels/feishu/feishuSessionRelay.js'
import { FeishuLongConnection } from '../../src/gclm-code-server/channels/feishu/feishuLongConnection.js'
import type { GclmCodeServerAppState } from '../../src/gclm-code-server/app/types.js'
import type { SessionExecutionBridge } from '../../src/gclm-code-server/execution/types.js'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function createExecutionBridge(): SessionExecutionBridge & {
  submitted: string[]
  interrupted: string[]
} {
  return {
    submitted: [],
    interrupted: [],
    async submitInput(input) {
      this.submitted.push(input.prompt)
    },
    async interrupt(session) {
      this.interrupted.push(session.id)
      return true
    },
    async resolvePermission() {
      return false
    },
  }
}

function createState(): GclmCodeServerAppState & {
  executionBridge: ReturnType<typeof createExecutionBridge>
} {
  const dir = mkdtempSync(join(tmpdir(), 'gclm-code-server-feishu-ws-'))
  tempDirs.push(dir)
  const db = createSqliteDatabase({
    path: join(dir, 'server.db'),
    busyTimeoutMs: 250,
  })
  runMigrations(db, join(import.meta.dir, '../../src/gclm-code-server/db/migrations'))
  const executionBridge = createExecutionBridge()

  const state = {
    env: {
      GCLM_CODE_SERVER_HOST: '127.0.0.1',
      GCLM_CODE_SERVER_PORT: 4317,
      GCLM_CODE_SERVER_SIGNING_SECRET: 'test-secret',
      GCLM_CODE_SERVER_DB_PATH: join(dir, 'server.db'),
      GCLM_CODE_SERVER_DB_BUSY_TIMEOUT_MS: 250,
      feishu: {
        enabled: true,
        baseUrl: 'https://open.feishu.cn',
        appId: 'cli_app_id',
        appSecret: 'cli_app_secret',
        bypassSignatureVerification: false,
        useLongConnection: true,
      },
    },
    db,
    repositories: {
      channelIdentities: new ChannelIdentityRepository(db),
      sessions: new SessionRepository(db),
      sessionBindings: new SessionBindingRepository(db),
      permissions: new PermissionRepository(db),
      idempotency: new IdempotencyRepository(db),
      audit: new AuditRepository(db),
    },
    streamHub: new StreamHub(),
    streamInfoService: new StreamInfoService('test-secret', 300),
    executionBridge,
    channels: {
      feishuAdapter: undefined as unknown as FeishuAdapter,
      feishuPublisher: new FeishuPublisher({
        config: {
          enabled: true,
          baseUrl: 'https://open.feishu.cn',
          appId: 'cli_app_id',
          appSecret: 'cli_app_secret',
          bypassSignatureVerification: false,
          useLongConnection: true,
        },
        audit: new AuditRepository(db),
        fetchImpl: async (input, init) => {
          const url = String(input)
          if (url.includes('/auth/v3/tenant_access_token/internal')) {
            return new Response(
              JSON.stringify({ tenant_access_token: 'tenant_token', expire: 7200, code: 0 }),
              { status: 200, headers: { 'content-type': 'application/json' } },
            )
          }

          return new Response(JSON.stringify({ code: 0, data: { message_id: 'om_card_1' } }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        },
      }),
      feishuRelay: undefined as unknown as FeishuSessionRelay,
      feishuLongConnection: undefined as unknown as FeishuLongConnection,
    },
  }

  state.channels.feishuAdapter = new FeishuAdapter(state)
  state.channels.feishuRelay = new FeishuSessionRelay(state)
  state.channels.feishuLongConnection = new FeishuLongConnection(state)

  return state
}

describe('FeishuLongConnection', () => {
  test('registers long connection handlers and routes inbound events', async () => {
    const state = createState()
    const handlers = new Map<string, (payload: unknown) => Promise<void> | void>()
    let closed = false

    const runtime = new FeishuLongConnection(state, {
      sdkFactory: async () => ({
        EventDispatcher: class {
          register(input: Record<string, (payload: unknown) => Promise<void> | void>) {
            for (const [key, value] of Object.entries(input)) {
              handlers.set(key, value)
            }
          }
        },
        WSClient: class {
          async start() {}
          close() {
            closed = true
          }
        },
      }),
      logger: console,
    })

    await runtime.start()
    expect(handlers.has('im.message.receive_v1')).toBe(true)
    expect(handlers.has('card.action.trigger')).toBe(true)

    await handlers.get('im.message.receive_v1')?.({
      sender: {
        sender_id: {
          open_id: 'ou_ws_1',
        },
        tenant_key: 'tenant_ws_1',
      },
      message: {
        message_id: 'om_ws_1',
        message_type: 'text',
        content: JSON.stringify({ text: '/context' }),
      },
    })

    expect(state.executionBridge.submitted).toEqual(['/context'])

    const latest = state.repositories.sessions.findLatestByOwnerAndChannel({
      ownerUserId: 'feishu:tenant_ws_1:ou_ws_1',
      sourceChannel: 'feishu',
    })
    expect(latest?.id).toBeString()

    await handlers.get('card.action.trigger')?.({
      operator: {
        open_id: 'ou_ws_1',
      },
      tenant_key: 'tenant_ws_1',
      action: {
        value: {
          action: 'interrupt_session',
          sessionId: latest?.id,
        },
      },
    })

    expect(state.executionBridge.interrupted).toHaveLength(1)
    await runtime.stop()
    expect(closed).toBe(true)
  })
})
