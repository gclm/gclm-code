import { randomUUID } from 'crypto'
import { Hono } from 'hono'
import { z } from 'zod/v4'
import type { Context } from 'hono'
import type { ChannelProvider } from '../identity/types.js'
import type { GclmCodeServerAppState } from './types.js'
import { renderConsolePage } from './consolePage.js'

const createSessionSchema = z.object({
  title: z.string().optional(),
  projectId: z.string().optional(),
  workspaceId: z.string().optional(),
  sourceChannel: z.enum(['web', 'feishu', 'dingtalk', 'api']),
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

function getRequestIdentity(c: Context): {
  userId: string
  providerUserId: string
  channel: ChannelProvider
  tenantScope: string
} {
  return {
    userId: c.req.header('x-gclm-user-id') ?? 'local-dev-user',
    providerUserId:
      c.req.header('x-gclm-provider-user-id') ??
      c.req.header('x-gclm-user-id') ??
      'local-dev-user',
    channel: (c.req.header('x-gclm-channel') as ChannelProvider | undefined) ?? 'web',
    tenantScope: c.req.header('x-gclm-tenant-scope') ?? '',
  }
}

function jsonRecord(input: Record<string, unknown> | undefined): string | undefined {
  return input ? JSON.stringify(input) : undefined
}

export function createApp(state: GclmCodeServerAppState) {
  const app = new Hono<{ Bindings: { state: GclmCodeServerAppState } }>()

  app.use('*', async (c, next) => {
    c.set('state', state)
    await next()
  })

  app.get('/health', c => {
    return c.json({ ok: true, service: 'gclm-code-server' })
  })

  app.get('/', c => c.redirect('/console'))

  app.get('/console', c => {
    return c.html(renderConsolePage())
  })

  app.get('/sessions', c => {
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

    return c.json({ items })
  })

  app.post('/sessions', async c => {
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
      const channelIdentityId = randomUUID()
      session = {
        id: `sess_${randomUUID()}`,
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
          provider: identity.channel,
          providerUserId: identity.providerUserId,
          tenantScope: identity.tenantScope,
          tenantId: identity.tenantScope || undefined,
          createdAt: now,
          updatedAt: now,
        })
        state.repositories.sessions.insert(session)
        state.repositories.sessionBindings.insert({
          id: `bind_${randomUUID()}`,
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
        requestId: `req_${randomUUID()}`,
      })
    }

    return c.json({
      session,
      initialPermissionRequests: state.repositories.permissions.findPendingBySession(
        session.id,
      ),
    })
  })

  app.get('/sessions/:id', c => {
    const session = state.repositories.sessions.findById(c.req.param('id'))
    if (!session) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404)
    }

    const pendingPermissions = state.repositories.permissions.findPendingBySession(session.id)
    return c.json({ session, pendingPermissions })
  })

  app.get('/sessions/:id/stream-info', c => {
    const identity = getRequestIdentity(c)
    const session = state.repositories.sessions.findById(c.req.param('id'))
    if (!session) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404)
    }

    const token = state.streamInfoService.issueWebSocketToken({
      sessionId: session.id,
      userId: identity.userId,
      channel: identity.channel,
    })

    return c.json({
      transport: 'websocket',
      stream: {
        path: `/sessions/${session.id}/stream`,
        token: token.token,
        expiresAt: token.expiresAt,
        tokenType: 'signed-ephemeral',
      },
    })
  })

  app.post('/sessions/:id/input', async c => {
    const session = state.repositories.sessions.findById(c.req.param('id'))
    if (!session) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404)
    }

    const body = sendInputSchema.parse(await c.req.json())
    const requestId = body.clientRequestId ?? `req_${randomUUID()}`
    const prompt = body.content
      .filter(item => item.type === 'text')
      .map(item => item.text)
      .join('\n')

    await state.executionBridge.submitInput({
      session,
      prompt,
      requestId,
    })

    return c.json({ accepted: true, sessionId: session.id, requestId })
  })

  app.post('/sessions/:id/interrupt', async c => {
    const session = state.repositories.sessions.findById(c.req.param('id'))
    if (!session) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404)
    }

    const accepted = await state.executionBridge.interrupt(session)
    return c.json({ accepted, sessionId: session.id })
  })

  app.get('/sessions/:id/permissions/pending', c => {
    const session = state.repositories.sessions.findById(c.req.param('id'))
    if (!session) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404)
    }

    return c.json({ items: state.repositories.permissions.findPendingBySession(session.id) })
  })

  app.post('/sessions/:id/permissions/:requestId/respond', async c => {
    const session = state.repositories.sessions.findById(c.req.param('id'))
    if (!session) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404)
    }

    const pending = state.repositories.permissions.findById(c.req.param('requestId'))
    if (!pending || pending.sessionId !== session.id) {
      return c.json(
        { error: { code: 'PERMISSION_NOT_FOUND', message: 'Permission request not found' } },
        404,
      )
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

    return c.json({ accepted, requestId: pending.id, behavior: decision.behavior })
  })

  app.post('/sessions/:id/archive', async c => {
    archiveSchema.parse(await c.req.json().catch(() => ({})))
    const session = state.repositories.sessions.findById(c.req.param('id'))
    if (!session) {
      return c.json({ error: { code: 'SESSION_NOT_FOUND', message: 'Session not found' } }, 404)
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

    return c.json({ session: updated ?? session })
  })

  return app
}
