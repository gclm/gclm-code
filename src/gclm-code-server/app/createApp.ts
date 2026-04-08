import { randomUUID } from 'crypto'
import { Hono } from 'hono'
import { z } from 'zod/v4'
import type { Context } from 'hono'
import type { ChannelProvider } from '../identity/types.js'
import type { SessionRecord } from '../sessions/types.js'
import type { GclmCodeServerAppState } from './types.js'
import { createAuthMiddleware } from './middleware/auth.js'
import { success, error } from './middleware/unifiedResponse.js'
import { createRecordId } from '../ids.js'

const createSessionSchema = z.object({
  title: z.string().optional(),
  projectId: z.string().optional(),
  workspaceId: z.string().optional(),
  sourceChannel: z.enum(['web', 'feishu', 'dingtalk', 'wecom', 'api']),
  mode: z.enum(['create', 'resume_or_create']).optional(),
  initialInput: z
    .array(z.object({ type: z.literal('text'), text: z.string() }))
    .optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const sendInputSchema = z.object({
  content: z.array(z.object({ type: z.literal('text'), text: z.string() })),
  clientRequestId: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const resolvePermissionSchema = z.discriminatedUnion('behavior', [
  z.object({
    behavior: z.literal('allow'),
    updatedInput: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    behavior: z.literal('deny'),
    message: z.string(),
  }),
])

const archiveSchema = z.object({}).optional()

const SERVER_START_TIME = new Date()

function getRequestIdentity(c: Context): {
  userId: string
  providerUserId: string
  provider: ChannelProvider
  tenantScope: string
} {
  return {
    userId: c.req.header('x-gclm-user-id') ?? 'local-dev-user',
    providerUserId:
      c.req.header('x-gclm-provider-user-id') ??
      c.req.header('x-gclm-user-id') ??
      'local-dev-user',
    provider: (c.req.header('x-gclm-provider') as ChannelProvider | undefined) ?? 'web',
    tenantScope: c.req.header('x-gclm-tenant-scope') ?? '',
  }
}

function jsonRecord(input: Record<string, unknown> | undefined): string | undefined {
  return input ? JSON.stringify(input) : undefined
}

function sessionNotFoundResponse(c: Context): Response {
  return c.json(error('SESSION_NOT_FOUND', 'Session not found'), 404)
}

export function createApp(state: GclmCodeServerAppState) {
  const app = new Hono<{ Bindings: { state: GclmCodeServerAppState } }>()

  app.use('*', async (c, next) => {
    c.set('state', state)
    await next()
  })

  const authEnabled = state.env.GCLM_CODE_SERVER_AUTH_ENABLED
  const auth = createAuthMiddleware(state.accessToken, authEnabled)
  const ensureAuthorized = async (c: Context): Promise<Response | null> => {
    const result = await auth(c, async () => {})
    return result instanceof Response ? result : null
  }
  const findOwnedSession = (c: Context): SessionRecord | Response => {
    const identity = getRequestIdentity(c)
    const session = state.repositories.sessions.findById(c.req.param('id'))
    if (!session || session.ownerUserId !== identity.userId) {
      return sessionNotFoundResponse(c)
    }
    return session
  }

  // --- Status endpoint (no auth) ---
  app.get('/api/v1/status', c => {
    return c.json(
      success({
        service: 'gclm-code-server',
        status: 'running',
        uptime: Math.floor((Date.now() - SERVER_START_TIME.getTime()) / 1000),
        sessions: state.repositories.sessions.countVisible(),
        version: '0.1.0',
      }),
    )
  })

  // --- API v1 routes (auth protected) ---
  const api = new Hono<{ Bindings: { state: GclmCodeServerAppState } }>()
  api.use('*', auth)

  api.get('/sessions', c => {
    const identity = getRequestIdentity(c)
    const status = c.req.query('status') as
      | 'running'
      | 'waiting_input'
      | 'completed'
      | 'failed'
      | 'archived'
      | undefined
    const sourceChannel = c.req.query('sourceChannel') as ChannelProvider | undefined
    const limit = Number.parseInt(c.req.query('limit') ?? '20', 10)

    const items = state.repositories.sessions.listByOwner({
      ownerUserId: identity.userId,
      sourceChannel,
      status,
      limit: Number.isFinite(limit) ? limit : 20,
    })

    return c.json(success({ items }))
  })

  api.post('/sessions', async c => {
    const identity = getRequestIdentity(c)
    const body = createSessionSchema.parse(await c.req.json())

    let session =
      body.mode === 'resume_or_create'
        ? state.repositories.sessions.findLatestByOwnerAndChannel({
            ownerUserId: identity.userId,
            sourceChannel: body.sourceChannel,
          })
        : null

    if (!session) {
      const now = new Date().toISOString()
      const existingIdentity = state.repositories.channelIdentities.findByProviderIdentity({
        provider: identity.provider,
        providerUserId: identity.providerUserId,
        tenantScope: identity.tenantScope,
      })
      const channelIdentityId = existingIdentity?.id ?? createRecordId('chid')
      session = {
        id: createRecordId('sess'),
        title: body.title,
        status: 'waiting_input' as const,
        projectId: body.projectId,
        workspaceId: body.workspaceId,
        ownerUserId: identity.userId,
        sourceChannel: body.sourceChannel,
        executionSessionRef: randomUUID(),
        metadataJson: jsonRecord(body.metadata),
        createdAt: now,
        updatedAt: now,
        lastActiveAt: now,
      }

      state.db.transaction(() => {
        state.repositories.channelIdentities.upsert({
          id: channelIdentityId,
          userId: identity.userId,
          provider: identity.provider,
          providerUserId: identity.providerUserId,
          tenantScope: identity.tenantScope,
          tenantId: identity.tenantScope || undefined,
          createdAt: existingIdentity?.createdAt ?? now,
          updatedAt: now,
        })
        state.repositories.sessions.insert(session)
        state.repositories.sessionBindings.insert({
          id: createRecordId('bind'),
          sessionId: session.id,
          channelIdentityId,
          userId: identity.userId,
          bindingType: 'owner',
          isPrimary: true,
          createdAt: now,
          updatedAt: now,
        })
      })()
    }

    state.streamHub.publish(session.id, {
      type: 'session.updated',
      data: session,
    })

    if (body.initialInput && body.initialInput.length > 0) {
      const prompt = body.initialInput.map(item => item.text).join('\n')
      await state.executionBridge.submitInput({
        session,
        prompt,
        requestId: createRecordId('req'),
      })
    }

    return c.json(
      success({
        session,
        initialPermissionRequests:
          state.repositories.permissions.findPendingBySession(session.id),
      }),
    )
  })

  api.get('/sessions/:id', c => {
    const session = findOwnedSession(c)
    if (session instanceof Response) {
      return session
    }

    const pendingPermissions = state.repositories.permissions.findPendingBySession(session.id)
    return c.json(success({ session, pendingPermissions }))
  })

  api.get('/sessions/:id/stream-info', c => {
    const identity = getRequestIdentity(c)
    const session = findOwnedSession(c)
    if (session instanceof Response) {
      return session
    }

    const token = state.streamInfoService.issueWebSocketToken({
      sessionId: session.id,
      userId: identity.userId,
      provider: identity.provider,
    })

    return c.json(
      success({
        transport: 'websocket',
        stream: {
          path: `/ws/v1/session/${session.id}/stream`,
          token: token.token,
          expiresAt: token.expiresAt,
          tokenType: 'signed-ephemeral',
        },
      }),
    )
  })

  api.post('/sessions/:id/input', async c => {
    const session = findOwnedSession(c)
    if (session instanceof Response) {
      return session
    }

    const body = sendInputSchema.parse(await c.req.json())
    const requestId = body.clientRequestId ?? createRecordId('req')
    const prompt = body.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n')

    await state.executionBridge.submitInput({
      session,
      prompt,
      requestId,
    })

    return c.json(success({ accepted: true, sessionId: session.id, requestId }))
  })

  api.post('/sessions/:id/interrupt', async c => {
    const session = findOwnedSession(c)
    if (session instanceof Response) {
      return session
    }

    const accepted = await state.executionBridge.interrupt(session)
    return c.json(success({ accepted, sessionId: session.id }))
  })

  api.get('/sessions/:id/permissions/pending', c => {
    const session = findOwnedSession(c)
    if (session instanceof Response) {
      return session
    }

    return c.json(
      success({ items: state.repositories.permissions.findPendingBySession(session.id) }),
    )
  })

  api.post('/sessions/:id/permissions/:requestId/respond', async c => {
    const session = findOwnedSession(c)
    if (session instanceof Response) {
      return session
    }

    const pending = state.repositories.permissions.findById(c.req.param('requestId'))
    if (!pending || pending.sessionId !== session.id) {
      return c.json(error('PERMISSION_NOT_FOUND', 'Permission request not found'), 404)
    }

    const identity = getRequestIdentity(c)
    const decision = resolvePermissionSchema.parse(await c.req.json())
    const accepted = await state.executionBridge.resolvePermission(
      session,
      pending.id,
      decision.behavior === 'allow'
        ? {
            behavior: 'allow',
            updatedInput: decision.updatedInput,
            resolvedBy: identity.userId,
          }
        : {
            behavior: 'deny',
            message: decision.message,
            resolvedBy: identity.userId,
          },
    )

    return c.json(success({ accepted, requestId: pending.id, behavior: decision.behavior }))
  })

  api.post('/sessions/:id/archive', async c => {
    archiveSchema.parse(await c.req.json().catch(() => ({})))
    const session = findOwnedSession(c)
    if (session instanceof Response) {
      return session
    }

    const now = new Date().toISOString()
    state.repositories.sessions.updateStatus({
      id: session.id,
      status: 'archived',
      updatedAt: now,
      archivedAt: now,
    })

    const updated = state.repositories.sessions.findById(session.id)
    state.streamHub.publish(session.id, {
      type: 'session.updated',
      data: updated ?? session,
    })

    return c.json(success({ session: updated ?? session }))
  })

  // Mount API v1
  app.route('/api/v1', api)

  // --- Static web files (served at root) ---
  app.get('/', async c => {
    const unauthorized = await ensureAuthorized(c)
    if (unauthorized) {
      return unauthorized
    }
    const web = Bun.file(new URL('../web/index.html', import.meta.url))
    if (await web.exists()) {
      return c.html(await web.text())
    }
    return c.redirect('/api/v1/status')
  })

  app.get('/terminal.html', async c => {
    const unauthorized = await ensureAuthorized(c)
    if (unauthorized) {
      return unauthorized
    }
    const web = Bun.file(new URL('../web/terminal.html', import.meta.url))
    if (await web.exists()) {
      return c.html(await web.text())
    }
    return c.notFound()
  })

  app.get('/css/*', async c => {
    const path = c.req.path.replace('/css/', 'css/')
    const web = Bun.file(new URL(`../web/${path}`, import.meta.url))
    if (await web.exists()) {
      return new Response(web, {
        headers: { 'Content-Type': 'text/css; charset=utf-8' },
      })
    }
    return c.notFound()
  })

  app.get('/js/*', async c => {
    const path = c.req.path.replace('/js/', 'js/')
    const web = Bun.file(new URL(`../web/${path}`, import.meta.url))
    if (await web.exists()) {
      const ct = path.endsWith('.js') ? 'application/javascript' : 'application/octet-stream'
      return new Response(web, {
        headers: { 'Content-Type': `${ct}; charset=utf-8` },
      })
    }
    return c.notFound()
  })

  return app
}
