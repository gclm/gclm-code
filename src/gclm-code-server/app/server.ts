import { randomUUID } from 'crypto'
import { randomBytes } from 'crypto'
import { createGclmCodeServerDatabase } from '../db/client.js'
import { LocalCliExecutionBridge } from '../execution/localCliExecutionBridge.js'
import { readGclmCodeServerEnv, type GclmCodeServerEnv } from '../config/env.js'
import { ChannelIdentityRepository } from '../identity/channelIdentityRepository.js'
import { SessionRepository } from '../sessions/sessionRepository.js'
import { SessionBindingRepository } from '../sessions/sessionBindingRepository.js'
import { PermissionRepository } from '../permissions/permissionRepository.js'
import { IdempotencyRepository } from '../channels/shared/idempotencyRepository.js'
import { AuditRepository } from '../audit/auditRepository.js'
import { FeishuAdapter } from '../channels/feishu/feishuAdapter.js'
import { FeishuLongConnection } from '../channels/feishu/feishuLongConnection.js'
import { FeishuPublisher } from '../channels/feishu/feishuPublisher.js'
import { FeishuSessionRelay } from '../channels/feishu/feishuSessionRelay.js'
import { StreamHub } from '../transport/streamHub.js'
import { StreamInfoService } from '../transport/streamInfoService.js'
import { createPtyWebSocketHandler } from '../transport/ptyWebSocketHandler.js'
import { createApp } from './createApp.js'
import type { GclmCodeServerAppState } from './types.js'

export type StartGclmCodeServerOptions = {
  port?: number
  host?: string
  signingSecret?: string
  env?: Partial<GclmCodeServerEnv>
}

export function createAppState(
  options: {
    env?: Partial<GclmCodeServerEnv>
    signingSecret?: string
  } = {},
): GclmCodeServerAppState {
  const baseEnv = readGclmCodeServerEnv()
  const env = {
    ...baseEnv,
    ...options.env,
    feishu: {
      ...baseEnv.feishu,
      ...options.env?.feishu,
    },
  }
  const { db } = createGclmCodeServerDatabase(env)
  const accessToken = env.GCLM_CODE_SERVER_SIGNING_SECRET.startsWith('gclm-code-server-')
    ? randomBytes(16).toString('hex')
    : env.GCLM_CODE_SERVER_SIGNING_SECRET
  const repositories = {
    channelIdentities: new ChannelIdentityRepository(db),
    sessions: new SessionRepository(db),
    sessionBindings: new SessionBindingRepository(db),
    permissions: new PermissionRepository(db),
    idempotency: new IdempotencyRepository(db),
    audit: new AuditRepository(db),
  }
  const streamHub = new StreamHub()
  const feishuPublisher = new FeishuPublisher({
    config: env.feishu,
    audit: repositories.audit,
  })
  const state = {} as GclmCodeServerAppState
  state.env = env
  state.accessToken = accessToken
  state.db = db
  state.repositories = repositories
  state.streamHub = streamHub
  state.streamInfoService = new StreamInfoService(
    options.signingSecret ?? env.GCLM_CODE_SERVER_SIGNING_SECRET,
  )
  state.executionBridge = new LocalCliExecutionBridge({
    sessions: repositories.sessions,
    permissions: repositories.permissions,
    streamHub,
  })
  const feishuAdapter = new FeishuAdapter(state)
  state.channels = {
    feishuAdapter,
    feishuPublisher,
    feishuRelay: new FeishuSessionRelay(state),
    feishuLongConnection: new FeishuLongConnection(state),
  }
  return state
}

export function startGclmCodeServer(options: StartGclmCodeServerOptions = {}) {
  const state = createAppState({
    env: options.env,
    signingSecret: options.signingSecret,
  })
  const app = createApp(state)

  const ptyHandler = createPtyWebSocketHandler(state)

  void state.channels.feishuLongConnection.start().catch(error => {
    console.error(
      `[gclm-code-server] failed to start Feishu long connection: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  })

  type WsData = {
    type: 'stream' | 'pty'
    sessionId?: string
    unsubscribe?: () => void
  }

  const server = Bun.serve<WsData>({
    hostname: options.host ?? state.env.GCLM_CODE_SERVER_HOST,
    port: options.port ?? state.env.GCLM_CODE_SERVER_PORT,
    fetch(req, server) {
      const url = new URL(req.url)
      const token = url.searchParams.get('token')

      // --- /ws/v1/session/:id/stream (JSON event stream for IM/card channels) ---
      const streamMatch = url.pathname.match(/^\/ws\/v1\/session\/([^/]+)\/stream$/)
      if (streamMatch) {
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

        if (payload.sessionId !== streamMatch[1]) {
          return new Response('Stream token does not match session', { status: 403 })
        }

        const success = server.upgrade(req, {
          data: { type: 'stream', sessionId: payload.sessionId },
        })
        if (success) return undefined
        return new Response('Failed to upgrade websocket', { status: 500 })
      }

      // --- /ws/v1/session/:id (PTY WebSocket for Web terminal) ---
      const ptyMatch = url.pathname.match(/^\/ws\/v1\/session\/([^/]+)$/)
      if (ptyMatch) {
        if (!token) {
          return new Response('Missing session token', { status: 401 })
        }

        let payload
        try {
          payload = state.streamInfoService.verifyWebSocketToken(token)
        } catch (error) {
          return new Response(
            error instanceof Error ? error.message : 'Invalid session token',
            { status: 401 },
          )
        }

        if (payload.sessionId !== ptyMatch[1]) {
          return new Response('Session token does not match session', { status: 403 })
        }

        const success = server.upgrade(req, {
          data: { type: 'pty', sessionId: payload.sessionId },
        })
        if (success) return undefined
        return new Response('Failed to upgrade websocket', { status: 500 })
      }

      return app.fetch(req)
    },
    websocket: {
      open(ws) {
        const { type, sessionId } = ws.data

        if (!sessionId) {
          ws.close(1008, 'Missing session context')
          return
        }

        if (type === 'stream') {
          // JSON event stream: raw JSON events to subscriber
          const unsubscribe = state.streamHub.subscribe(sessionId, {
            id: randomUUID(),
            send(event) {
              ws.send(JSON.stringify(event))
            },
          })
          ws.data.unsubscribe = unsubscribe

          const session = state.repositories.sessions.findById(sessionId)
          if (session) {
            ws.send(
              JSON.stringify({
                type: 'session.updated',
                data: session,
              }),
            )
          }
        } else if (type === 'pty') {
          // PTY WebSocket: formatted terminal output
          ptyHandler.handleOpen(ws as never)
        }
      },
      message(ws, message) {
        const text = typeof message === 'string' ? message : new TextDecoder().decode(message)

        if (ws.data.type === 'pty') {
          ptyHandler.handleMessage(ws as never, text)
        }
        // Stream WebSocket ignores client messages (one-way)
      },
      close(ws) {
        if (ws.data.type === 'pty') {
          ptyHandler.handleClose(ws as never)
        } else {
          ws.data.unsubscribe?.()
        }
      },
    },
  })

  const host = options.host ?? state.env.GCLM_CODE_SERVER_HOST
  const port = server.port
  const webConsoleUrl = `http://${host}:${port}/${state.env.GCLM_CODE_SERVER_AUTH_ENABLED ? `?token=${state.accessToken}` : ''}`

  console.log(`\n  gclm-code-server v0.1.0`)
  console.log(`  ─────────────────────────────────────`)
  console.log(`  Web Console:   ${webConsoleUrl}`)
  console.log(`  API Base:      http://${host}:${port}/api/v1`)
  console.log(`  Status:        http://${host}:${port}/api/v1/status`)
  console.log(`  WebSocket:     ws://${host}:${port}/ws/v1/session/:id/stream`)
  console.log(
    `  PTY:           ws://${host}:${port}/ws/v1/session/:id (signed token via /api/v1/sessions/:id/stream-info)`,
  )
  if (state.env.GCLM_CODE_SERVER_AUTH_ENABLED) {
    console.log(`  Token:         ${state.accessToken}`)
  }
  console.log(`  Auth:          ${state.env.GCLM_CODE_SERVER_AUTH_ENABLED ? 'enabled' : 'disabled'}`)
  console.log(`  Feishu:        ${state.env.feishu.enabled ? 'long connection' : 'disabled'}`)
  console.log(`  DB:            ${state.env.GCLM_CODE_SERVER_DB_PATH}`)
  console.log(`\n`)

  return {
    server,
    state,
    stop() {
      void state.channels.feishuLongConnection.stop()
      state.channels.feishuRelay.stop()
      server.stop(true)
    },
  }
}
