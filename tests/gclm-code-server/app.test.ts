import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createApp } from '../../src/gclm-code-server/app/createApp.js'
import type { GclmCodeServerAppState } from '../../src/gclm-code-server/app/types.js'
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

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true })
  }
})

function createState(): GclmCodeServerAppState {
  const dir = mkdtempSync(join(tmpdir(), 'gclm-code-server-app-'))
  tempDirs.push(dir)
  const db = createSqliteDatabase({
    path: join(dir, 'server.db'),
    busyTimeoutMs: 250,
  })
  runMigrations(db, join(import.meta.dir, '../../src/gclm-code-server/db/migrations'))
  return {
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
  }
}

describe('gclm-code-server app', () => {
  test('creates a session and returns stream info', async () => {
    const app = createApp(createState())

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

  test('accepts input and lists sessions', async () => {
    const app = createApp(createState())

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

    const listResp = await app.request('/sessions', {
      headers: {
        'x-gclm-user-id': 'user_2',
      },
    })
    const listJson = await listResp.json()
    expect(listJson.items).toHaveLength(1)
    expect(listJson.items[0].ownerUserId).toBe('user_2')
  })
})
