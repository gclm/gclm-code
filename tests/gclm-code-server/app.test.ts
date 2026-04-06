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
import type { SessionRecord } from '../../src/gclm-code-server/sessions/types.js'
import { FeishuPublisher } from '../../src/gclm-code-server/channels/feishu/feishuPublisher.js'

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function createFakeExecutionBridge(): SessionExecutionBridge & {
  submitted: ExecutionSubmitInput[]
  interrupted: string[]
  resolved: Array<{ sessionId: string; requestId: string; decision: ExecutionPermissionDecision }>
} {
  return {
    submitted: [],
    interrupted: [],
    resolved: [],
    async submitInput(input) {
      this.submitted.push(input)
    },
    async interrupt(session) {
      this.interrupted.push(session.id)
      return true
    },
    async resolvePermission(session, requestId, decision) {
      this.resolved.push({ sessionId: session.id, requestId, decision })
      return true
    },
  }
}

function createState(executionBridge = createFakeExecutionBridge()): GclmCodeServerAppState {
  const dir = mkdtempSync(join(tmpdir(), 'gclm-code-server-app-'))
  tempDirs.push(dir)
  const db = createSqliteDatabase({
    path: join(dir, 'server.db'),
    busyTimeoutMs: 250,
  })
  runMigrations(db, join(import.meta.dir, '../../src/gclm-code-server/db/migrations'))
  return {
    env: {
      GCLM_CODE_SERVER_HOST: '127.0.0.1',
      GCLM_CODE_SERVER_PORT: 4317,
      GCLM_CODE_SERVER_SIGNING_SECRET: 'test-secret',
      GCLM_CODE_SERVER_DB_PATH: join(dir, 'server.db'),
      GCLM_CODE_SERVER_DB_BUSY_TIMEOUT_MS: 250,
      feishu: {
        enabled: false,
        baseUrl: 'https://open.feishu.cn',
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
      feishuPublisher: new FeishuPublisher({
        config: {
          enabled: false,
          baseUrl: 'https://open.feishu.cn',
          bypassSignatureVerification: false,
        },
        audit: new AuditRepository(db),
        fetchImpl: fetch,
      }),
    },
  }
}

describe('gclm-code-server app', () => {
  test('serves the self-hosted web console shell', async () => {
    const app = createApp(createState())

    const resp = await app.request('/console')

    expect(resp.status).toBe(200)
    expect(resp.headers.get('content-type')).toContain('text/html')
    const html = await resp.text()
    expect(html).toContain('gclm-code-server')
    expect(html).toContain('Self-hosted Console')
    expect(html).toContain('/sessions')
  })

  test('creates a session and returns stream info', async () => {
    const fakeBridge = createFakeExecutionBridge()
    const app = createApp(createState(fakeBridge))

    const createResp = await app.request('/sessions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-gclm-user-id': 'user_1',
        'x-gclm-provider-user-id': 'web_user_1',
        'x-gclm-channel': 'web',
      },
      body: JSON.stringify({
        sourceChannel: 'web',
        mode: 'create',
        title: 'Test Session',
      }),
    })

    expect(createResp.status).toBe(200)
    const createJson = await createResp.json()
    expect(createJson.session.id).toContain('sess_')
    expect(createJson.session.executionSessionRef).toBeString()
    expect(fakeBridge.submitted).toHaveLength(0)

    const streamResp = await app.request(
      `/sessions/${createJson.session.id}/stream-info`,
      {
        headers: {
          'x-gclm-user-id': 'user_1',
          'x-gclm-provider-user-id': 'web_user_1',
          'x-gclm-channel': 'web',
        },
      },
    )
    const streamJson = await streamResp.json()
    expect(streamJson.stream.path).toBe(`/sessions/${createJson.session.id}/stream`)
    expect(streamJson.stream.tokenType).toBe('signed-ephemeral')
  })

  test('submits input through the execution bridge and lists sessions', async () => {
    const fakeBridge = createFakeExecutionBridge()
    const app = createApp(createState(fakeBridge))

    const createResp = await app.request('/sessions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-gclm-user-id': 'user_2',
        'x-gclm-provider-user-id': 'web_user_2',
        'x-gclm-channel': 'web',
      },
      body: JSON.stringify({ sourceChannel: 'web', mode: 'create' }),
    })
    const createJson = await createResp.json()

    const inputResp = await app.request(`/sessions/${createJson.session.id}/input`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-gclm-user-id': 'user_2',
        'x-gclm-provider-user-id': 'web_user_2',
        'x-gclm-channel': 'web',
      },
      body: JSON.stringify({
        content: [{ type: 'text', text: 'hello server' }],
      }),
    })

    expect(inputResp.status).toBe(200)
    expect(fakeBridge.submitted).toHaveLength(1)
    expect(fakeBridge.submitted[0]?.prompt).toBe('hello server')

    const listResp = await app.request('/sessions', {
      headers: {
        'x-gclm-user-id': 'user_2',
      },
    })
    const listJson = await listResp.json()
    expect(listJson.items).toHaveLength(1)
    expect(listJson.items[0].ownerUserId).toBe('user_2')
  })

  test('starts initial input and resolves permission requests via the bridge', async () => {
    const fakeBridge = createFakeExecutionBridge()
    const state = createState(fakeBridge)
    const app = createApp(state)

    const createResp = await app.request('/sessions', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-gclm-user-id': 'user_3',
        'x-gclm-provider-user-id': 'web_user_3',
        'x-gclm-channel': 'web',
      },
      body: JSON.stringify({
        sourceChannel: 'web',
        mode: 'create',
        initialInput: [{ type: 'text', text: 'boot session' }],
      }),
    })
    const createJson = await createResp.json()
    expect(fakeBridge.submitted).toHaveLength(1)
    expect(fakeBridge.submitted[0]?.prompt).toBe('boot session')

    const session = state.repositories.sessions.findById(createJson.session.id) as SessionRecord
    state.repositories.permissions.insert({
      id: 'req_perm_1',
      sessionId: session.id,
      toolName: 'Bash',
      toolUseId: 'toolu_1',
      status: 'pending',
      scope: 'once',
      inputJson: '{"cmd":"pwd"}',
      requestedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const resolveResp = await app.request(
      `/sessions/${session.id}/permissions/req_perm_1/respond`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-gclm-user-id': 'user_3',
        },
        body: JSON.stringify({ behavior: 'allow', updatedInput: { cmd: 'pwd' } }),
      },
    )

    expect(resolveResp.status).toBe(200)
    expect(fakeBridge.resolved).toHaveLength(1)
    expect(fakeBridge.resolved[0]?.requestId).toBe('req_perm_1')

    const interruptResp = await app.request(`/sessions/${session.id}/interrupt`, {
      method: 'POST',
    })
    expect(interruptResp.status).toBe(200)
    expect(fakeBridge.interrupted).toContain(session.id)
  })
})
