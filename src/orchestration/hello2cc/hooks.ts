import { registerHookCallbacks } from '../../bootstrap/state.js'
import type {
  HookInput,
  HookJSONOutput,
} from '../../entrypoints/agentSdkTypes.js'
import type { HookCallback } from '../../types/hooks.js'
import { AGENT_TOOL_NAME } from '../../tools/AgentTool/constants.js'
import { ENTER_WORKTREE_TOOL_NAME } from '../../tools/EnterWorktreeTool/constants.js'
import { SEND_MESSAGE_TOOL_NAME } from '../../tools/SendMessageTool/constants.js'
import { TEAM_CREATE_TOOL_NAME } from '../../tools/TeamCreateTool/constants.js'
import { logForDebugging } from '../../utils/debug.js'
import { analyzeIntentProfile } from './intentProfile.js'
import {
  buildRouteGuidance,
  buildSessionStartContext,
} from './routeGuidance.js'
import {
  ensureHello2ccSessionState,
  rememberIntentProfile,
  rememberRouteGuidance,
  rememberToolFailure,
  rememberToolSuccess,
} from './sessionState.js'
import { normalizeToolInput } from './toolNormalization.js'
import { checkToolPreconditions } from './preconditions.js'

const NORMALIZED_TOOL_MATCHER = [
  AGENT_TOOL_NAME,
  TEAM_CREATE_TOOL_NAME,
  SEND_MESSAGE_TOOL_NAME,
  ENTER_WORKTREE_TOOL_NAME,
].join('|')

type SessionStartHookInput = HookInput & {
  session_id: string
  cwd: string
  agent_type?: string
  model?: string
}

type UserPromptSubmitHookInput = HookInput & {
  session_id: string
  cwd: string
  agent_type?: string
  prompt: string
}

type PreToolUseHookInput = HookInput & {
  session_id: string
  cwd: string
  agent_type?: string
  tool_name: string
  tool_input: unknown
}

type PostToolUseHookInput = HookInput & {
  session_id: string
  tool_name: string
  tool_input: unknown
  tool_response: unknown
}

type PostToolUseFailureHookInput = HookInput & {
  session_id: string
  tool_name: string
  tool_input: unknown
  error: string
}

function summarizeToolResponse(response: unknown): string {
  if (typeof response === 'string') {
    return response.slice(0, 160)
  }
  if (!response || typeof response !== 'object') {
    return 'completed without structured result details'
  }

  const candidate = response as Record<string, unknown>
  if (typeof candidate.message === 'string') {
    return candidate.message.slice(0, 160)
  }
  if (typeof candidate.status === 'string') {
    return `status=${candidate.status}`
  }
  return `completed with keys: ${Object.keys(candidate).slice(0, 5).join(', ')}`
}

const sessionStartHook: HookCallback = {
  type: 'callback',
  timeout: 1,
  async callback(input): Promise<HookJSONOutput> {
    const hookInput = input as SessionStartHookInput
    const sessionState = ensureHello2ccSessionState({
      sessionId: hookInput.session_id,
      cwd: hookInput.cwd,
      agentType: hookInput.agent_type,
      model: hookInput.model,
    })

    return {
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'SessionStart',
        additionalContext: buildSessionStartContext(sessionState),
      },
    }
  },
}

const userPromptSubmitHook: HookCallback = {
  type: 'callback',
  timeout: 1,
  async callback(input): Promise<HookJSONOutput> {
    const hookInput = input as UserPromptSubmitHookInput
    const sessionState = ensureHello2ccSessionState({
      sessionId: hookInput.session_id,
      cwd: hookInput.cwd,
      agentType: hookInput.agent_type,
    })
    const intentProfile = analyzeIntentProfile(hookInput.prompt)
    const nextState = rememberIntentProfile(hookInput.session_id, intentProfile)
    const guidance = buildRouteGuidance(nextState ?? sessionState, intentProfile)
    rememberRouteGuidance(hookInput.session_id, guidance)

    return {
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: guidance,
      },
    }
  },
}

const preToolUseHook: HookCallback = {
  type: 'callback',
  timeout: 1,
  async callback(input): Promise<HookJSONOutput> {
    const hookInput = input as PreToolUseHookInput
    const sessionState = ensureHello2ccSessionState({
      sessionId: hookInput.session_id,
      cwd: hookInput.cwd,
      agentType: hookInput.agent_type,
    })
    const normalization = normalizeToolInput(
      hookInput.tool_name,
      hookInput.tool_input as Record<string, unknown>,
      sessionState,
    )

    if (!normalization.updatedInput && normalization.notes.length === 0) {
      const precondition = checkToolPreconditions(
        hookInput.tool_name,
        hookInput.tool_input as Record<string, unknown>,
        sessionState,
      )
      if (!precondition.blocked && precondition.notes.length === 0) {
        return { continue: true }
      }

      return {
        continue: !precondition.blocked,
        stopReason: precondition.reason,
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          additionalContext:
            precondition.notes.length > 0
              ? precondition.notes.join(' ')
              : precondition.reason,
        },
      }
    }

    const nextInput =
      normalization.updatedInput ?? (hookInput.tool_input as Record<string, unknown>)
    const precondition = checkToolPreconditions(
      hookInput.tool_name,
      nextInput,
      sessionState,
    )

    return {
      continue: !precondition.blocked,
      stopReason: precondition.reason,
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        updatedInput: normalization.updatedInput,
        additionalContext:
          [...normalization.notes, ...precondition.notes].length > 0
            ? [...normalization.notes, ...precondition.notes].join(' ')
            : precondition.reason,
      },
    }
  },
}

const postToolUseHook: HookCallback = {
  type: 'callback',
  timeout: 1,
  async callback(input): Promise<HookJSONOutput> {
    const hookInput = input as PostToolUseHookInput
    rememberToolSuccess(
      hookInput.session_id,
      hookInput.tool_name,
      hookInput.tool_input as Record<string, unknown>,
      summarizeToolResponse(hookInput.tool_response),
    )
    return { continue: true }
  },
}

const postToolUseFailureHook: HookCallback = {
  type: 'callback',
  timeout: 1,
  async callback(input): Promise<HookJSONOutput> {
    const hookInput = input as PostToolUseFailureHookInput
    const nextState = rememberToolFailure(
      hookInput.session_id,
      hookInput.tool_name,
      hookInput.tool_input as Record<string, unknown>,
      hookInput.error,
    )

    const failure = nextState?.recentFailures.find(
      record => record.toolName === hookInput.tool_name,
    )
    if (!failure || failure.count < 2) {
      return { continue: true }
    }

    return {
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'PostToolUseFailure',
        additionalContext: `The session has now seen ${hookInput.tool_name} fail ${failure.count} times recently. Prefer a different path unless the next attempt changes the preconditions.`,
      },
    }
  },
}

let registered = false

export function registerHello2ccHooks(): void {
  if (registered) {
    return
  }
  registered = true

  registerHookCallbacks({
    SessionStart: [{ matcher: '*', hooks: [sessionStartHook] }],
    UserPromptSubmit: [{ matcher: '*', hooks: [userPromptSubmitHook] }],
    PreToolUse: [{ matcher: NORMALIZED_TOOL_MATCHER, hooks: [preToolUseHook] }],
    PostToolUse: [{ matcher: '*', hooks: [postToolUseHook] }],
    PostToolUseFailure: [{ matcher: '*', hooks: [postToolUseFailureHook] }],
  })

  logForDebugging('Registered hello2cc Gateway orchestration hooks')
}
