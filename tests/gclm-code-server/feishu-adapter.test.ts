import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createApp } from '../../src/gclm-code-server/app/createApp.js'
import type { GclmCodeServerAppState } from '../../src/gclm-code-server/app/types.js'
import type {
  ExecutionPermissionDecision,
  ExecutionSubmitInput,
  SessionExecutionBridge,
} from '../../src/gclm-code-server/execution/types.js'
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
import { createHash } from 'crypto'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function createFakeExecutionBridge(): SessionExecutionBridge & {
  submitted: ExecutionSubmitInput[]
  resolved: Array<{ sessionId: string; requestId: string; decision: ExecutionPermissionDecision }>
} {
  return {
    submitted: [],
    resolved: [],
    async submitInput(input) {
      this.submitted.push(input)
    },
    async interrupt() {
      return true
    },
    async resolvePermission(session, requestId, decision) {
      this.resolved.push({ sessionId: session.id, requestId, decision })
      return true
    },
  }
}

function createPublisherRecorder() {
  const calls: Array<{ url: string; method: string; body: unknown }> = []
  const cardkitCalls: Array<{
    type: 'card.create' | 'message.create' | 'cardElement.content' | 'card.settings'
    body: unknown
  }> = []
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ url, method, body })

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
  }

  const sdkFactory = async () => ({
    Client: class {
      cardkit = {
        v1: {
          card: {
            create: async (input: unknown) => {
              cardkitCalls.push({ type: 'card.create', body: input })
              return { data: { card_id: 'card_123' } }
            },
            settings: async (input: unknown) => {
              cardkitCalls.push({ type: 'card.settings', body: input })
              return {}
            },
          },
          cardElement: {
            content: async (input: unknown) => {
              cardkitCalls.push({ type: 'cardElement.content', body: input })
              return {}
            },
          },
        },
      }

      im = {
        message: {
          create: async (input: unknown) => {
            cardkitCalls.push({ type: 'message.create', body: input })
            return { data: { message_id: 'om_stream_123' } }
          },
        },
      }
    },
  })

  return { calls, fetchImpl, sdkFactory, cardkitCalls }
}

function signFeishuPayload(rawBody: string, input: { timestamp: string; nonce: string; encryptKey: string }) {
  return createHash('sha256')
    .update(input.timestamp)
    .update(input.nonce)
    .update(input.encryptKey)
    .update(rawBody)
    .digest('hex')
}

function createState(
  executionBridge = createFakeExecutionBridge(),
  options?: {
    feishuEnabled?: boolean
    verificationToken?: string
    encryptKey?: string
  },
): GclmCodeServerAppState {
  const dir = mkdtempSync(join(tmpdir(), 'gclm-code-server-feishu-'))
  tempDirs.push(dir)
  const db = createSqliteDatabase({
    path: join(dir, 'server.db'),
    busyTimeoutMs: 250,
  })
  runMigrations(db, join(import.meta.dir, '../../src/gclm-code-server/db/migrations'))
  const publisher = createPublisherRecorder()
  const state = {
    env: {
      GCLM_CODE_SERVER_HOST: '127.0.0.1',
      GCLM_CODE_SERVER_PORT: 4317,
      GCLM_CODE_SERVER_SIGNING_SECRET: 'test-secret',
      GCLM_CODE_SERVER_DB_PATH: join(dir, 'server.db'),
      GCLM_CODE_SERVER_DB_BUSY_TIMEOUT_MS: 250,
      feishu: {
        enabled: options?.feishuEnabled ?? false,
        baseUrl: 'https://open.feishu.cn',
        appId: 'cli_app_id',
        appSecret: 'cli_app_secret',
        useLongConnection: true,
        verificationToken: options?.verificationToken,
        encryptKey: options?.encryptKey,
        bypassSignatureVerification: false,
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
          enabled: options?.feishuEnabled ?? false,
          baseUrl: 'https://open.feishu.cn',
          appId: 'cli_app_id',
          appSecret: 'cli_app_secret',
          useLongConnection: true,
          verificationToken: options?.verificationToken,
          encryptKey: options?.encryptKey,
          bypassSignatureVerification: false,
        },
        audit: new AuditRepository(db),
        fetchImpl: publisher.fetchImpl,
        sdkFactory: publisher.sdkFactory,
      }),
      feishuRelay: undefined as unknown as FeishuSessionRelay,
      feishuLongConnection: undefined as unknown as FeishuLongConnection,
    },
  }
  state.channels.feishuAdapter = new FeishuAdapter(state)
  state.channels.feishuRelay = new FeishuSessionRelay(state)
  state.channels.feishuLongConnection = {
    start: async () => {},
    stop: async () => {},
  } as FeishuLongConnection
  return state
}

describe('gclm-code-server feishu adapter', () => {
  test('accepts url verification handshake', async () => {
    const app = createApp(createState())

    const resp = await app.request('/channels/feishu/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'url_verification',
        challenge: 'hello-feishu',
      }),
    })

    expect(resp.status).toBe(200)
    expect(await resp.json()).toEqual({ challenge: 'hello-feishu' })
  })

  test('creates or resumes a feishu session from inbound message event', async () => {
    const fakeBridge = createFakeExecutionBridge()
    const state = createState(fakeBridge, { feishuEnabled: true })
    const app = createApp(state)

    const resp = await app.request('/channels/feishu/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schema: '2.0',
        header: {
          event_id: 'evt_1',
          event_type: 'im.message.receive_v1',
          tenant_key: 'tenant_1',
        },
        event: {
          sender: {
            sender_id: {
              open_id: 'ou_123',
            },
            tenant_key: 'tenant_1',
          },
          message: {
            message_id: 'om_1',
            message_type: 'text',
            content: JSON.stringify({ text: '/cost' }),
          },
        },
      }),
    })

    expect(resp.status).toBe(200)
    const json = await resp.json()
    expect(json.accepted).toBe(true)
    expect(json.sessionId).toContain('sess_')
    expect(fakeBridge.submitted).toHaveLength(1)
    expect(fakeBridge.submitted[0]?.prompt).toBe('/cost')

    const sessions = state.repositories.sessions.listByOwner({
      ownerUserId: 'feishu:tenant_1:ou_123',
      limit: 10,
    })
    expect(sessions).toHaveLength(1)
    expect(sessions[0]?.sourceChannel).toBe('feishu')
  })

  test('routes feishu permission action into execution bridge resolution', async () => {
    const fakeBridge = createFakeExecutionBridge()
    const state = createState(fakeBridge, { feishuEnabled: true })
    const app = createApp(state)

    const createResp = await app.request('/channels/feishu/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schema: '2.0',
        header: {
          event_id: 'evt_2',
          event_type: 'im.message.receive_v1',
          tenant_key: 'tenant_2',
        },
        event: {
          sender: {
            sender_id: {
              open_id: 'ou_456',
            },
            tenant_key: 'tenant_2',
          },
          message: {
            message_id: 'om_2',
            message_type: 'text',
            content: JSON.stringify({ text: 'hello' }),
          },
        },
      }),
    })
    const createJson = await createResp.json()

    state.repositories.permissions.insert({
      id: 'perm_1',
      sessionId: createJson.sessionId,
      toolName: 'Bash',
      toolUseId: 'toolu_perm_1',
      status: 'pending',
      scope: 'once',
      inputJson: '{"cmd":"pwd"}',
      requestedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const actionResp = await app.request('/channels/feishu/actions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        open_id: 'ou_456',
        tenant_key: 'tenant_2',
        token: 'action_token_1',
        action: {
          value: {
            action: 'permission_response',
            sessionId: createJson.sessionId,
            requestId: 'perm_1',
            decision: 'approve',
          },
        },
      }),
    })

    expect(actionResp.status).toBe(200)
    const actionJson = await actionResp.json()
    expect(actionJson.accepted).toBe(true)
    expect(fakeBridge.resolved).toHaveLength(1)
    expect(fakeBridge.resolved[0]?.requestId).toBe('perm_1')
    expect(fakeBridge.resolved[0]?.decision.behavior).toBe('allow')
  })

  test('relays assistant output from a feishu session back to outbound messages', async () => {
    const fakeBridge = createFakeExecutionBridge()
    const state = createState(fakeBridge, { feishuEnabled: true })
    const app = createApp(state)

    const resp = await app.request('/channels/feishu/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        schema: '2.0',
        header: {
          event_id: 'evt_3',
          event_type: 'im.message.receive_v1',
          tenant_key: 'tenant_3',
        },
        event: {
          sender: {
            sender_id: {
              open_id: 'ou_789',
            },
            tenant_key: 'tenant_3',
          },
          message: {
            message_id: 'om_3',
            message_type: 'text',
            content: JSON.stringify({ text: 'hello relay' }),
          },
        },
      }),
    })

    const json = await resp.json()
    state.streamHub.publish(json.sessionId, {
      type: 'session.updated',
      data: {
        id: json.sessionId,
        status: 'running',
      },
    })

    state.streamHub.publish(json.sessionId, {
      type: 'message.completed',
      data: {
        sessionId: json.sessionId,
        role: 'assistant',
        text: 'relay back to feishu',
      },
    })

    const outboundCount = Number(
      state.db
        .prepare(
          "SELECT COUNT(*) AS count FROM audit_events WHERE event_type IN ('feishu.outbound.card.create', 'feishu.outbound.card.update')",
        )
        .get()?.count ?? 0,
    )
    expect(outboundCount).toBeGreaterThan(0)
  })

  test('normalizes long connection events into session input and interrupt action', async () => {
    const fakeBridge = createFakeExecutionBridge()
    const state = createState(fakeBridge, { feishuEnabled: true })

    const inbound = await state.channels.feishuAdapter.handleLongConnectionMessageEvent({
      sender: {
        sender_id: {
          open_id: 'ou_long_1',
        },
        tenant_key: 'tenant_long_1',
      },
      message: {
        message_id: 'om_long_1',
        message_type: 'text',
        content: JSON.stringify({ text: '/cost' }),
      },
    })

    expect(inbound.accepted).toBe(true)
    expect(fakeBridge.submitted).toHaveLength(1)

    const interrupt = await state.channels.feishuAdapter.handleLongConnectionActionEvent({
      operator: {
        open_id: 'ou_long_1',
      },
      tenant_key: 'tenant_long_1',
      action: {
        value: {
          action: 'interrupt_session',
          sessionId: inbound.sessionId,
        },
      },
    })

    expect(interrupt.accepted).toBe(true)
  })

  test('rejects feishu event when signature verification fails', async () => {
    const state = createState(createFakeExecutionBridge(), {
      feishuEnabled: true,
      verificationToken: 'token_ok',
      encryptKey: 'encrypt_secret',
    })
    const app = createApp(state)

    const payload = {
      type: 'url_verification',
      challenge: 'hello-feishu',
      token: 'token_bad',
    }
    const rawBody = JSON.stringify(payload)

    const resp = await app.request('/channels/feishu/events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-lark-request-timestamp': '1710000000',
        'x-lark-request-nonce': 'nonce_1',
        'x-lark-signature': signFeishuPayload(rawBody, {
          timestamp: '1710000000',
          nonce: 'nonce_1',
          encryptKey: 'encrypt_secret',
        }),
      },
      body: rawBody,
    })

    expect(resp.status).toBe(401)
  })

  test('accepts signed feishu handshake when token and signature are valid', async () => {
    const state = createState(createFakeExecutionBridge(), {
      feishuEnabled: true,
      verificationToken: 'token_ok',
      encryptKey: 'encrypt_secret',
    })
    const app = createApp(state)

    const payload = {
      type: 'url_verification',
      challenge: 'hello-feishu',
      token: 'token_ok',
    }
    const rawBody = JSON.stringify(payload)

    const resp = await app.request('/channels/feishu/events', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-lark-request-timestamp': '1710000000',
        'x-lark-request-nonce': 'nonce_1',
        'x-lark-signature': signFeishuPayload(rawBody, {
          timestamp: '1710000000',
          nonce: 'nonce_1',
          encryptKey: 'encrypt_secret',
        }),
      },
      body: rawBody,
    })

    expect(resp.status).toBe(200)
    expect(await resp.json()).toEqual({ challenge: 'hello-feishu' })
  })
})
