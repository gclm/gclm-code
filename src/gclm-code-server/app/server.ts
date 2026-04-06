import { randomUUID } from 'crypto'
import { createGclmCodeServerDatabase } from '../db/client.js'
import { ChannelIdentityRepository } from '../identity/channelIdentityRepository.js'
import { SessionRepository } from '../sessions/sessionRepository.js'
import { SessionBindingRepository } from '../sessions/sessionBindingRepository.js'
import { PermissionRepository } from '../permissions/permissionRepository.js'
import { IdempotencyRepository } from '../channels/shared/idempotencyRepository.js'
import { AuditRepository } from '../audit/auditRepository.js'
import { StreamHub } from '../transport/streamHub.js'
import { StreamInfoService } from '../transport/streamInfoService.js'
import { createApp } from './createApp.js'
import type { GclmCodeServerAppState } from './types.js'

export type StartGclmCodeServerOptions = {
  port?: number
  host?: string
  signingSecret?: string
}

export function createAppState(signingSecret = 'gclm-code-server-dev-secret'): GclmCodeServerAppState {
  const { db } = createGclmCodeServerDatabase()
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
    streamInfoService: new StreamInfoService(signingSecret),
  }
}

export function startGclmCodeServer(options: StartGclmCodeServerOptions = {}) {
  const state = createAppState(options.signingSecret)
  const app = createApp(state)

  const server = Bun.serve<{ sessionId?: string }>({
    hostname: options.host ?? '127.0.0.1',
    port: options.port ?? 4317,
    fetch(req, server) {
      const url = new URL(req.url)
      const match = url.pathname.match(/^\/sessions\/([^/]+)\/stream$/)
      if (match) {
        const token = url.searchParams.get('token')
        if (!token) {
          return new Response('Missing stream token', { status: 401 })
        }

        let payload
        try {
          payload = state.streamInfoService.verifyWebSocketToken(token)
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Invalid stream token',
            { status: 401 },
          )
        }

        if (payload.sessionId !== match[1]) {
          return new Response('Stream token does not match session', { status: 403 })
        }

        const success = server.upgrade(req, {
          data: { sessionId: payload.sessionId },
        })
        if (success) {
          return undefined
        }
        return new Response('Failed to upgrade websocket', { status: 500 })
      }

      return app.fetch(req)
    },
    websocket: {
      open(ws) {
        const sessionId = ws.data.sessionId
        if (!sessionId) {
          ws.close(1008, 'Missing session context')
          return
        }

        const unsubscribe = state.streamHub.subscribe(sessionId, {
          id: randomUUID(),
          send(event) {
            ws.send(JSON.stringify(event))
          },
        })

        ;(ws.data as { unsubscribe?: () => void }).unsubscribe = unsubscribe

        const session = state.repositories.sessions.findById(sessionId)
        if (session) {
          ws.send(
            JSON.stringify({
              type: 'session.updated',
              data: session,
            }),
          )
        }
      },
      message() {},
      close(ws) {
        ws.data.unsubscribe?.()
      },
    },
  })

  const heartbeat = setInterval(() => {
    const now = new Date().toISOString()
    // We do not maintain a session registry here, so publish heartbeat lazily
    // only when callers explicitly publish further events.
    void now
  }, 30000)

  return {
    server,
    state,
    stop() {
      clearInterval(heartbeat)
      server.stop(true)
    },
  }
}
