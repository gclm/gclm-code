import { randomUUID } from 'crypto'
import { spawn, type ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import type { PermissionRepository } from '../permissions/permissionRepository.js'
import type { SessionRepository } from '../sessions/sessionRepository.js'
import type { SessionRecord } from '../sessions/types.js'
import type { StreamHub } from '../transport/streamHub.js'
import type {
  ExecutionPermissionDecision,
  ExecutionSubmitInput,
  SessionExecutionBridge,
} from './types.js'

export type LocalCliExecutionBridgeOptions = {
  sessions: SessionRepository
  permissions: PermissionRepository
  streamHub: StreamHub
  repoRoot?: string
  cliEntry?: string
  spawnProcess?: typeof spawn
  env?: NodeJS.ProcessEnv
}

type ActiveSessionProcess = {
  child: ChildProcess
  requestId: string
}

type JsonMap = Record<string, unknown>

function isJsonMap(value: unknown): value is JsonMap {
  return typeof value === 'object' && value !== null
}

function collectTextFromContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .filter(isJsonMap)
    .filter(block => block.type === 'text' && typeof block.text === 'string')
    .map(block => String(block.text))
    .join('')
}

function collectThinkingFromContent(content: unknown): string {
  if (!Array.isArray(content)) {
    return ''
  }

  return content
    .filter(isJsonMap)
    .filter(block => block.type === 'thinking' && typeof block.thinking === 'string')
    .map(block => String(block.thinking))
    .join('\n\n')
}

function collectAssistantPreview(content: unknown): {
  text: string
  phase: 'thinking' | 'assistant'
} | null {
  const text = collectTextFromContent(content).trim()
  if (text) {
    return {
      text,
      phase: 'assistant',
    }
  }

  const thinking = collectThinkingFromContent(content).trim()
  if (thinking) {
    return {
      text: thinking,
      phase: 'thinking',
    }
  }

  return null
}

export class LocalCliExecutionBridge implements SessionExecutionBridge {
  private readonly activeProcesses = new Map<string, ActiveSessionProcess>()
  private readonly lastAssistantPreview = new Map<string, string>()
  private readonly repoRoot: string
  private readonly cliEntry: string
  private readonly spawnProcess: typeof spawn
  private readonly startedSessions = new Set<string>()
  private readonly env: NodeJS.ProcessEnv

  constructor(private readonly options: LocalCliExecutionBridgeOptions) {
    this.repoRoot = options.repoRoot ?? process.cwd()
    this.cliEntry = options.cliEntry ?? './src/entrypoints/cli.tsx'
    this.spawnProcess = options.spawnProcess ?? spawn
    this.env = options.env ?? process.env
  }

  async submitInput(input: ExecutionSubmitInput): Promise<void> {
    if (this.activeProcesses.has(input.session.id)) {
      throw new Error(`Session ${input.session.id} already has an active execution`)
    }

    this.markSessionRunning(input.session)
    const resume = this.startedSessions.has(input.session.id)
    const child = this.spawnProcess(
      process.execPath,
      this.buildArgs(input.session, input.prompt, resume),
      {
        cwd: this.repoRoot,
        env: {
          ...this.env,
          CLAUDE_CODE_SIMPLE: this.env.CLAUDE_CODE_SIMPLE ?? '1',
          CLAUDE_CODE_DISABLE_BACKGROUND_TASKS:
            this.env.CLAUDE_CODE_DISABLE_BACKGROUND_TASKS ?? '1',
          CLAUDE_CODE_DISABLE_AUTO_MEMORY:
            this.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY ?? '1',
          CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC:
            this.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC ?? '1',
          DISABLE_AUTOUPDATER: this.env.DISABLE_AUTOUPDATER ?? '1',
          USER_TYPE: this.env.USER_TYPE ?? 'external',
        },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    )

    this.activeProcesses.set(input.session.id, {
      child,
      requestId: input.requestId,
    })
    this.startedSessions.add(input.session.id)
    this.attachProcessListeners(input.session, child)
  }

  async interrupt(session: SessionRecord): Promise<boolean> {
    const processHandle = this.activeProcesses.get(session.id)
    if (!processHandle) {
      return false
    }

    processHandle.child.kill('SIGTERM')
    this.options.streamHub.publish(session.id, {
      type: 'session.interrupted',
      data: { sessionId: session.id, requestId: processHandle.requestId },
    })
    return true
  }

  async resolvePermission(
    session: SessionRecord,
    requestId: string,
    decision: ExecutionPermissionDecision,
  ): Promise<boolean> {
    void session
    void requestId
    void decision
    // The current MVP bridge runs each turn via argv prompt + stream-json output.
    // That mode gives us stable real execution and resume, but it does not expose
    // a supported stdin control channel for permission responses yet.
    return false
  }

  private buildArgs(session: SessionRecord, prompt: string, resume: boolean): string[] {
    const executionSessionRef = session.executionSessionRef ?? randomUUID()
    const base = [
      'run',
      this.cliEntry,
      '--print',
      '--output-format',
      'stream-json',
      '--verbose',
    ]

    if (resume) {
      return [...base, '--resume', executionSessionRef, prompt]
    }

    return [...base, '--session-id', executionSessionRef, prompt]
  }

  private attachProcessListeners(session: SessionRecord, child: ChildProcess): void {
    if (child.stdout) {
      const stdout = createInterface({ input: child.stdout })
      stdout.on('line', line => this.handleStdoutLine(session, line))
    }

    if (child.stderr) {
      const stderr = createInterface({ input: child.stderr })
      stderr.on('line', line => {
        this.options.streamHub.publish(session.id, {
          type: 'sdk.stderr',
          data: { sessionId: session.id, line },
        })
      })
    }

    child.on('error', error => {
      this.activeProcesses.delete(session.id)
      this.lastAssistantPreview.delete(session.id)
      this.finalizeTurn(session, 'failed', {
        sessionId: session.id,
        error: error.message,
      })
    })

    child.on('exit', (code, signal) => {
      this.activeProcesses.delete(session.id)
      this.lastAssistantPreview.delete(session.id)
      this.options.streamHub.publish(session.id, {
        type: 'session.process.exited',
        data: { sessionId: session.id, exitCode: code, signal },
      })
    })
  }

  private handleStdoutLine(session: SessionRecord, line: string): void {
    let parsed: unknown
    try {
      parsed = JSON.parse(line)
    } catch {
      this.options.streamHub.publish(session.id, {
        type: 'sdk.stdout.raw',
        data: { sessionId: session.id, line },
      })
      return
    }

    if (!isJsonMap(parsed) || typeof parsed.type !== 'string') {
      return
    }

    this.options.streamHub.publish(session.id, {
      type: 'sdk.message',
      data: parsed,
    })

    if (parsed.type === 'assistant') {
      const message = isJsonMap(parsed.message) ? parsed.message : undefined
      const preview = collectAssistantPreview(message?.content)
      if (preview && this.lastAssistantPreview.get(session.id) !== preview.text) {
        this.lastAssistantPreview.set(session.id, preview.text)
        this.options.streamHub.publish(session.id, {
          type: 'message.delta',
          data: {
            sessionId: session.id,
            messageId:
              typeof parsed.uuid === 'string' ? parsed.uuid : `msg_${randomUUID()}`,
            role: 'assistant',
            text: preview.text,
            phase: preview.phase,
            createdAt: new Date().toISOString(),
            raw: parsed,
          },
        })
      }

      const text = collectTextFromContent(message?.content)
      if (text.trim()) {
        this.options.streamHub.publish(session.id, {
          type: 'message.completed',
          data: {
            sessionId: session.id,
            messageId:
              typeof parsed.uuid === 'string' ? parsed.uuid : `msg_${randomUUID()}`,
            role: 'assistant',
            text,
            createdAt: new Date().toISOString(),
            raw: parsed,
          },
        })
        this.lastAssistantPreview.delete(session.id)
      }
      return
    }

    if (parsed.type === 'control_request') {
      this.handlePermissionRequest(session, parsed)
      return
    }

    if (parsed.type === 'control_cancel_request') {
      if (typeof parsed.request_id === 'string') {
        const now = new Date().toISOString()
        this.options.permissions.updateStatus({
          id: parsed.request_id,
          status: 'cancelled',
          updatedAt: now,
          resolvedAt: now,
        })
        this.options.streamHub.publish(session.id, {
          type: 'permission.cancelled',
          data: { sessionId: session.id, requestId: parsed.request_id },
        })
      }
      return
    }

    if (parsed.type === 'result') {
      this.finalizeTurn(
        session,
        parsed.subtype === 'success' ? 'waiting_input' : 'failed',
        {
          sessionId: session.id,
          requestId: this.activeProcesses.get(session.id)?.requestId,
          result: parsed,
        },
      )
    }
  }

  private handlePermissionRequest(session: SessionRecord, message: JsonMap): void {
    const request = isJsonMap(message.request) ? message.request : undefined
    if (!request || request.subtype !== 'can_use_tool') {
      return
    }
    if (typeof message.request_id !== 'string') {
      return
    }

    const now = new Date().toISOString()
    const record = {
      id: message.request_id,
      sessionId: session.id,
      toolName: typeof request.tool_name === 'string' ? request.tool_name : 'unknown',
      toolUseId:
        typeof request.tool_use_id === 'string'
          ? request.tool_use_id
          : `toolu_${randomUUID()}`,
      status: 'pending' as const,
      scope: 'once' as const,
      inputJson: JSON.stringify(isJsonMap(request.input) ? request.input : {}),
      requestedAt: now,
      createdAt: now,
      updatedAt: now,
    }

    try {
      this.options.permissions.insert(record)
    } catch {
      // Duplicate request IDs should remain idempotent.
    }

    this.options.streamHub.publish(session.id, {
      type: 'permission.requested',
      data: record,
    })
  }

  private markSessionRunning(session: SessionRecord): void {
    const now = new Date().toISOString()
    this.options.sessions.updateStatus({
      id: session.id,
      status: 'running',
      updatedAt: now,
    })

    const updated = this.options.sessions.findById(session.id) ?? {
      ...session,
      status: 'running',
      updatedAt: now,
      lastActiveAt: now,
    }

    this.options.streamHub.publish(session.id, {
      type: 'session.updated',
      data: updated,
    })
  }

  private finalizeTurn(
    session: SessionRecord,
    status: SessionRecord['status'],
    details: Record<string, unknown>,
  ): void {
    const now = new Date().toISOString()
    this.options.sessions.updateStatus({
      id: session.id,
      status,
      updatedAt: now,
    })

    const updated = this.options.sessions.findById(session.id) ?? {
      ...session,
      status,
      updatedAt: now,
      lastActiveAt: now,
    }

    this.options.streamHub.publish(session.id, {
      type: 'session.updated',
      data: updated,
    })
    this.options.streamHub.publish(session.id, {
      type: 'session.execution.completed',
      data: {
        ...details,
        status,
      },
    })
  }
}
