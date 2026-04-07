import { describe, expect, test } from 'bun:test'
import { EventEmitter } from 'events'
import { PassThrough } from 'stream'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { createSqliteDatabase } from '../../src/gclm-code-server/db/sqlite.js'
import { runMigrations } from '../../src/gclm-code-server/db/migrationRunner.js'
import { SessionRepository } from '../../src/gclm-code-server/sessions/sessionRepository.js'
import { PermissionRepository } from '../../src/gclm-code-server/permissions/permissionRepository.js'
import { StreamHub, type StreamEvent } from '../../src/gclm-code-server/transport/streamHub.js'
import { LocalCliExecutionBridge } from '../../src/gclm-code-server/execution/localCliExecutionBridge.js'

describe('LocalCliExecutionBridge delta streaming', () => {
  test('publishes thinking and assistant delta events before completion', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gclm-code-server-local-bridge-'))
    try {
      const db = createSqliteDatabase({
        path: join(dir, 'server.db'),
        busyTimeoutMs: 250,
      })
      runMigrations(db, join(import.meta.dir, '../../src/gclm-code-server/db/migrations'))

      const sessions = new SessionRepository(db)
      const permissions = new PermissionRepository(db)
      const streamHub = new StreamHub()
      const events: StreamEvent[] = []

      streamHub.subscribe('sess_delta_1', {
        id: 'test-subscriber',
        send(event) {
          events.push(event)
        },
      })

      const stdout = new PassThrough()
      const stderr = new PassThrough()
      const child = new EventEmitter() as EventEmitter & {
        stdout: PassThrough
        stderr: PassThrough
        kill: (signal?: string) => boolean
      }
      child.stdout = stdout
      child.stderr = stderr
      child.kill = () => true

      const bridge = new LocalCliExecutionBridge({
        sessions,
        permissions,
        streamHub,
        spawnProcess: () => child as never,
      })

      const now = new Date().toISOString()
      sessions.insert({
        id: 'sess_delta_1',
        title: 'Bridge Delta Test',
        status: 'waiting_input',
        ownerUserId: 'user_delta_1',
        sourceChannel: 'web',
        executionSessionRef: 'exec_delta_1',
        createdAt: now,
        updatedAt: now,
        lastActiveAt: now,
      })

      await bridge.submitInput({
        session: sessions.findById('sess_delta_1')!,
        prompt: 'hello',
        requestId: 'req_delta_1',
      })

      stdout.write(
        `${JSON.stringify({
          type: 'assistant',
          uuid: 'msg_thinking_1',
          message: {
            content: [
              {
                type: 'thinking',
                thinking: '先整理思路',
              },
            ],
          },
        })}\n`,
      )

      stdout.write(
        `${JSON.stringify({
          type: 'assistant',
          uuid: 'msg_answer_1',
          message: {
            content: [
              {
                type: 'text',
                text: '第一段输出',
              },
            ],
          },
        })}\n`,
      )

      stdout.write(
        `${JSON.stringify({
          type: 'result',
          subtype: 'success',
        })}\n`,
      )

      child.emit('exit', 0, null)
      await new Promise(resolve => setTimeout(resolve, 20))

      const deltaEvents = events.filter(event => event.type === 'message.delta')
      const completedEvents = events.filter(event => event.type === 'message.completed')

      expect(deltaEvents).toHaveLength(2)
      expect((deltaEvents[0]?.data as Record<string, unknown>).phase).toBe('thinking')
      expect((deltaEvents[0]?.data as Record<string, unknown>).text).toBe('先整理思路')
      expect((deltaEvents[1]?.data as Record<string, unknown>).phase).toBe('assistant')
      expect((deltaEvents[1]?.data as Record<string, unknown>).text).toBe('第一段输出')
      expect(completedEvents).toHaveLength(1)
      expect((completedEvents[0]?.data as Record<string, unknown>).text).toBe('第一段输出')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
