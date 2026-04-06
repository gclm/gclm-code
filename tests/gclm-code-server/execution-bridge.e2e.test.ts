import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'
import { createSqliteDatabase } from '../../src/gclm-code-server/db/sqlite.js'
import { runMigrations } from '../../src/gclm-code-server/db/migrationRunner.js'
import { SessionRepository } from '../../src/gclm-code-server/sessions/sessionRepository.js'
import { PermissionRepository } from '../../src/gclm-code-server/permissions/permissionRepository.js'
import { StreamHub, type StreamEvent } from '../../src/gclm-code-server/transport/streamHub.js'
import { LocalCliExecutionBridge } from '../../src/gclm-code-server/execution/localCliExecutionBridge.js'
import type { SessionRecord } from '../../src/gclm-code-server/sessions/types.js'

const root = join(import.meta.dir, '..', '..')
let tempDir = ''

beforeAll(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'gclm-code-server-e2e-'))
})

afterAll(() => {
  if (tempDir) {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

function waitForEvent(
  streamHub: StreamHub,
  sessionId: string,
  predicate: (event: StreamEvent) => boolean,
  timeoutMs = 30_000,
): Promise<StreamEvent> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe()
      reject(new Error(`Timed out waiting for event on session ${sessionId}`))
    }, timeoutMs)

    const unsubscribe = streamHub.subscribe(sessionId, {
      id: randomUUID(),
      send(event) {
        if (!predicate(event)) {
          return
        }
        clearTimeout(timer)
        unsubscribe()
        resolve(event)
      },
    })
  })
}

describe('LocalCliExecutionBridge e2e', () => {
  test('runs real local slash commands across fresh and resumed session turns', async () => {
    const db = createSqliteDatabase({
      path: join(tempDir, 'bridge-e2e.db'),
      busyTimeoutMs: 250,
    })
    runMigrations(db, join(root, 'src/gclm-code-server/db/migrations'))

    const sessions = new SessionRepository(db)
    const permissions = new PermissionRepository(db)
    const streamHub = new StreamHub()

    const home = join(tempDir, 'home')
    mkdirSync(join(home, '.config'), { recursive: true })
    mkdirSync(join(home, '.cache'), { recursive: true })

    const bridge = new LocalCliExecutionBridge({
      sessions,
      permissions,
      streamHub,
      repoRoot: root,
      env: {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: join(home, '.config'),
        XDG_CACHE_HOME: join(home, '.cache'),
        NODE_ENV: 'production',
        USER_TYPE: 'external',
        CLAUDE_CODE_SIMPLE: '1',
        CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
        CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
        DISABLE_AUTOUPDATER: '1',
      },
    })

    const now = new Date().toISOString()
    const session: SessionRecord = {
      id: 'sess_e2e_1',
      title: 'Bridge E2E',
      status: 'waiting_input',
      ownerUserId: 'user_e2e',
      sourceChannel: 'web',
      executionSessionRef: randomUUID(),
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    }
    sessions.insert(session)

    const firstCompletion = waitForEvent(
      streamHub,
      session.id,
      event => event.type === 'session.execution.completed',
    )
    const firstExit = waitForEvent(
      streamHub,
      session.id,
      event => event.type === 'session.process.exited',
    )

    await bridge.submitInput({
      session,
      prompt: '/cost',
      requestId: 'req_cost',
    })

    const firstDone = await firstCompletion
    await firstExit
    expect((firstDone.data as Record<string, unknown>).status).toBe('waiting_input')
    const firstSession = sessions.findById(session.id)
    expect(firstSession?.status).toBe('waiting_input')

    const secondCompletion = waitForEvent(
      streamHub,
      session.id,
      event => event.type === 'session.execution.completed',
    )
    const secondExit = waitForEvent(
      streamHub,
      session.id,
      event => event.type === 'session.process.exited',
    )

    await bridge.submitInput({
      session: sessions.findById(session.id) ?? session,
      prompt: '/context',
      requestId: 'req_context',
    })

    const secondDone = await secondCompletion
    await secondExit
    expect((secondDone.data as Record<string, unknown>).status).toBe('waiting_input')
    const secondSession = sessions.findById(session.id)
    expect(secondSession?.status).toBe('waiting_input')
    expect(permissions.findPendingBySession(session.id)).toHaveLength(0)
  }, { timeout: 60_000 })
})
