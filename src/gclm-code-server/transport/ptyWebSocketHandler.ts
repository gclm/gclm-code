import type { ServerWebSocket } from 'bun'
import type { GclmCodeServerAppState } from '../app/types.js'

type WsData = {
  sessionId: string
  unsubscribe?: () => void
}

type JsonMap = Record<string, unknown>

function isJsonMap(value: unknown): value is JsonMap {
  return typeof value === 'object' && value !== null
}

function formatEventForTerminal(event: JsonMap): string {
  const type = typeof event.type === 'string' ? event.type : ''
  const data = isJsonMap(event.data) ? event.data : event

  switch (type) {
    case 'message.delta': {
      const text = typeof data.text === 'string' ? data.text : ''
      const phase = typeof data.phase === 'string' ? data.phase : ''
      if (phase === 'thinking') {
        return `\x1b[2m${text}\x1b[0m\n`
      }
      return `${text}\n`
    }
    case 'message.completed': {
      const text = typeof data.text === 'string' ? data.text : ''
      return `${text}\n`
    }
    case 'session.updated': {
      const status = typeof data.status === 'string' ? data.status : ''
      return `\n--- session status: ${status} ---\n`
    }
    case 'session.execution.completed': {
      const status = typeof data.status === 'string' ? data.status : ''
      return `\n--- execution completed: ${status} ---\n`
    }
    case 'session.interrupted':
      return `\n--- session interrupted ---\n`
    case 'permission.requested': {
      const tool = typeof data.toolName === 'string' ? data.toolName : 'unknown'
      const reqId = typeof data.id === 'string' ? data.id : '?'
      return `\n\x1b[33m[permission] ${tool} (id=${reqId}) awaiting approval\x1b[0m\n`
    }
    case 'permission.cancelled':
      return `\n[permission] cancelled\n`
    case 'sdk.stderr': {
      const line = typeof data.line === 'string' ? data.line : ''
      return `\x1b[31m${line}\x1b[0m\n`
    }
    default:
      return ''
  }
}

export function createPtyWebSocketHandler(
  state: GclmCodeServerAppState,
) {
  function handleOpen(ws: ServerWebSocket<WsData>) {
    const sessionId = ws.data.sessionId
    if (!sessionId) {
      ws.close(1008, 'Missing session context')
      return
    }

    const unsubscribe = state.streamHub.subscribe(sessionId, {
      id: crypto.randomUUID(),
      send(event) {
        const formatted = formatEventForTerminal(event as JsonMap)
        if (formatted) {
          ws.send(formatted)
        }
      },
    })

    ws.data.unsubscribe = unsubscribe

    const session = state.repositories.sessions.findById(sessionId)
    if (session) {
      const info = `\x1b[36mgclm-code-server | session: ${session.id} | status: ${session.status}\x1b[0m\n\n`
      ws.send(info)
    }
  }

  function handleMessage(_ws: ServerWebSocket<WsData>, message: string) {
    let parsed: unknown
    try {
      parsed = JSON.parse(message)
    } catch {
      return
    }

    if (isJsonMap(parsed) && parsed.type === 'resize') {
      // PTY resize — no-op for current CLI subprocess mode
      return
    }
  }

  function handleClose(ws: ServerWebSocket<WsData>) {
    ws.data.unsubscribe?.()
  }

  return {
    handleOpen,
    handleMessage,
    handleClose,
  }
}
