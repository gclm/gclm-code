import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startGclmCodeServer } from '../src/gclm-code-server/app/server.js'

if (typeof Bun === 'undefined') {
  process.stderr.write('Run this smoke test with Bun: `bun ./scripts/smoke-gclm-code-server.mjs`.\n')
  process.exit(1)
}

const host = '127.0.0.1'
const signingSecret = 'gclm-code-server-smoke-signing-secret'
const userId = 'smoke-user'
const root = process.cwd()
const tempDir = mkdtempSync(join(tmpdir(), 'gclm-code-server-smoke-'))
const home = join(tempDir, 'home')
const cache = join(home, '.cache')
const config = join(home, '.config')
let accessToken = ''
mkdirSync(cache, { recursive: true })
mkdirSync(config, { recursive: true })

const envOverrides = {
  HOME: home,
  XDG_CACHE_HOME: cache,
  XDG_CONFIG_HOME: config,
  NODE_ENV: 'production',
  USER_TYPE: 'external',
  CLAUDE_CODE_SIMPLE: '1',
  CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
  CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
  DISABLE_AUTOUPDATER: '1',
}

const originalEnv = new Map()
for (const [key, value] of Object.entries(envOverrides)) {
  originalEnv.set(key, process.env[key])
  process.env[key] = value
}

function restoreEnv() {
  for (const [key, value] of originalEnv) {
    if (value === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
  }
}

function makeHeaders(input = {}) {
  return {
    Authorization: `Bearer ${accessToken}`,
    'x-gclm-user-id': userId,
    'x-gclm-provider-user-id': `web-${userId}`,
    'x-gclm-provider': 'web',
    ...input,
  }
}

async function fetchJson(url, init) {
  const response = await fetch(url, init)
  const raw = await response.text()
  let body = null
  try {
    body = raw ? JSON.parse(raw) : null
  } catch {
    body = null
  }
  return { response, body, raw }
}

async function waitForHttpReady(baseUrl, timeoutMs = 5_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const { response, body } = await fetchJson(`${baseUrl}/api/v1/status`)
      if (response.ok && body?.ok) {
        return body
      }
    } catch {
      // Ignore until timeout.
    }
    await Bun.sleep(100)
  }
  throw new Error(`Timed out waiting for ${baseUrl}/api/v1/status`)
}

function createWsQueue(url, parseMode) {
  const ws = new WebSocket(url)
  const messages = []
  const waiters = []

  function flush() {
    while (waiters.length > 0) {
      const waiter = waiters[0]
      const index = messages.findIndex(waiter.predicate)
      if (index === -1) {
        return
      }
      const [message] = messages.splice(index, 1)
      waiters.shift()
      clearTimeout(waiter.timer)
      waiter.resolve(message)
    }
  }

  ws.addEventListener('message', event => {
    const data = String(event.data)
    const parsed = parseMode === 'json' ? JSON.parse(data) : data
    messages.push(parsed)
    flush()
  })

  ws.addEventListener('error', event => {
    while (waiters.length > 0) {
      const waiter = waiters.shift()
      clearTimeout(waiter.timer)
      waiter.reject(new Error(`WebSocket error while connecting to ${url}`))
    }
  })

  return {
    ws,
    waitFor(predicate, timeoutMs = 10_000) {
      return new Promise((resolve, reject) => {
        const index = messages.findIndex(predicate)
        if (index !== -1) {
          const [message] = messages.splice(index, 1)
          resolve(message)
          return
        }

        const timer = setTimeout(() => {
          const waiterIndex = waiters.findIndex(waiter => waiter.resolve === resolve)
          if (waiterIndex !== -1) {
            waiters.splice(waiterIndex, 1)
          }
          reject(new Error(`Timed out waiting for WebSocket message from ${url}`))
        }, timeoutMs)

        waiters.push({ predicate, resolve, reject, timer })
      })
    },
    close() {
      ws.close()
    },
  }
}

async function startRuntimeWithRetry() {
  const requestedPort = Number.parseInt(process.env.GCLM_CODE_SERVER_SMOKE_PORT ?? '', 10)
  const portCandidates = Number.isFinite(requestedPort) ? [requestedPort] : [0]

  let lastError = null
  for (const port of portCandidates) {
    try {
      const runtime = startGclmCodeServer({
        host,
        port,
        signingSecret,
        env: {
          GCLM_CODE_SERVER_HOST: host,
          GCLM_CODE_SERVER_PORT: port,
          GCLM_CODE_SERVER_SIGNING_SECRET: signingSecret,
          GCLM_CODE_SERVER_AUTH_ENABLED: true,
          GCLM_CODE_SERVER_DB_PATH: join(tempDir, `server-${port}.db`),
          GCLM_CODE_SERVER_DB_BUSY_TIMEOUT_MS: 250,
          feishu: {
            enabled: false,
            baseUrl: 'https://open.feishu.cn',
            useLongConnection: false,
            bypassSignatureVerification: false,
          },
        },
      })
      return { runtime, port: runtime.server.port }
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      const isBindConflict =
        message.includes('EADDRINUSE') ||
        message.includes('Failed to start server. Is port') ||
        message.includes('Address already in use')
      if (!isBindConflict) {
        throw error
      }
    }
  }

  const attemptedPorts = portCandidates
    .map(port => (port === 0 ? '0 (ephemeral)' : String(port)))
    .join(', ')
  throw new Error(
    `Failed to bind gclm-code-server smoke runtime across ports ${attemptedPorts}. Current environment may block Bun.serve or those ports are occupied.`,
  )
}

let runtime = null
let streamWs = null
let ptyWs = null

try {
  const started = await startRuntimeWithRetry()
  runtime = started.runtime
  accessToken = runtime.state.accessToken
  if (!accessToken) {
    throw new Error('Smoke runtime did not expose an access token')
  }
  const baseUrl = `http://${host}:${started.port}`
  const wsBase = `ws://${host}:${started.port}`

  const statusBody = await waitForHttpReady(baseUrl)

  const unauthorizedList = await fetchJson(`${baseUrl}/api/v1/sessions`)
  if (unauthorizedList.response.status !== 401) {
    throw new Error(`Expected /api/v1/sessions without token to return 401, got ${unauthorizedList.response.status}`)
  }

  const createResult = await fetchJson(`${baseUrl}/api/v1/sessions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...makeHeaders(),
    },
    body: JSON.stringify({
      sourceChannel: 'web',
      mode: 'create',
      title: 'Smoke Session',
    }),
  })
  if (!createResult.response.ok || !createResult.body?.ok) {
    throw new Error(`Failed to create session: ${createResult.raw}`)
  }

  const sessionId = createResult.body.data.session.id

  const unauthorizedTerminal = await fetch(`${baseUrl}/terminal.html?id=${sessionId}`, {
    headers: { accept: 'text/html' },
  })
  const unauthorizedTerminalHtml = await unauthorizedTerminal.text()
  if (
    unauthorizedTerminal.status !== 401 ||
    !unauthorizedTerminalHtml.includes("url.searchParams.set('token',v)")
  ) {
    throw new Error('Terminal auth challenge did not preserve deep-link query params')
  }

  const streamInfo = await fetchJson(`${baseUrl}/api/v1/sessions/${sessionId}/stream-info`, {
    headers: makeHeaders(),
  })
  if (!streamInfo.response.ok || !streamInfo.body?.ok) {
    throw new Error(`Failed to fetch stream info: ${streamInfo.raw}`)
  }

  const stream = streamInfo.body.data.stream
  if (stream.tokenType !== 'signed-ephemeral') {
    throw new Error(`Unexpected stream token type: ${String(stream.tokenType)}`)
  }

  streamWs = createWsQueue(
    `${wsBase}${stream.path}?token=${encodeURIComponent(stream.token)}`,
    'json',
  )
  const initialStreamEvent = await streamWs.waitFor(
    event => event?.type === 'session.updated' && event?.data?.id === sessionId,
  )

  ptyWs = createWsQueue(
    `${wsBase}/ws/v1/session/${sessionId}?token=${encodeURIComponent(stream.token)}`,
    'text',
  )
  const ptyBanner = await ptyWs.waitFor(
    text => typeof text === 'string' && text.includes(sessionId) && text.includes('gclm-code-server'),
  )

  const crossUserDetail = await fetchJson(`${baseUrl}/api/v1/sessions/${sessionId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'x-gclm-user-id': 'smoke-other-user',
      'x-gclm-provider-user-id': 'web-smoke-other-user',
      'x-gclm-provider': 'web',
    },
  })
  if (crossUserDetail.response.status !== 404) {
    throw new Error(`Expected cross-user session detail to return 404, got ${crossUserDetail.response.status}`)
  }

  const inputResult = await fetchJson(`${baseUrl}/api/v1/sessions/${sessionId}/input`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...makeHeaders(),
    },
    body: JSON.stringify({
      content: [{ type: 'text', text: '/cost' }],
    }),
  })
  if (!inputResult.response.ok || !inputResult.body?.ok) {
    throw new Error(`Failed to submit smoke input: ${inputResult.raw}`)
  }

  const executionCompleted = await streamWs.waitFor(
    event => event?.type === 'session.execution.completed',
    30_000,
  )

  process.stdout.write(
    JSON.stringify(
      {
        ok: true,
        evidence: 'scripted-flow',
        baseUrl,
        sessionId,
        status: statusBody.data ?? statusBody,
        streamPath: stream.path,
        streamTokenType: stream.tokenType,
        initialStreamEvent: initialStreamEvent.type,
        ptyBannerPreview: typeof ptyBanner === 'string' ? ptyBanner.trim() : null,
        executionStatus: executionCompleted?.data?.status ?? null,
        repoRoot: root,
      },
      null,
      2,
    ) + '\n',
  )
} catch (error) {
  process.stderr.write(
    JSON.stringify(
      {
        ok: false,
        evidence: 'scripted-flow',
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ) + '\n',
  )
  process.exitCode = 1
} finally {
  try {
    streamWs?.close()
  } catch {}
  try {
    ptyWs?.close()
  } catch {}
  try {
    runtime?.stop()
  } catch {}
  restoreEnv()
  rmSync(tempDir, { recursive: true, force: true })
}
