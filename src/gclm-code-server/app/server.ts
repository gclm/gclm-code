import { randomUUID } from 'crypto'
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
  void state.channels.feishuLongConnection.start().catch(error => {
    console.error(
      `[gclm-code-server] failed to start Feishu long connection: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  })

  const server = Bun.serve<{ sessionId?: string; unsubscribe?: () => void }>({
    hostname: options.host ?? state.env.GCLM_CODE_SERVER_HOST,
    port: options.port ?? state.env.GCLM_CODE_SERVER_PORT,
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
      },
      message() {},
      close(ws) {
        ws.data.unsubscribe?.()
      },
    },
  })

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
