import { AGENT_TOOL_NAME } from '../../tools/AgentTool/constants.js'
import { ENTER_WORKTREE_TOOL_NAME } from '../../tools/EnterWorktreeTool/constants.js'
import { SEND_MESSAGE_TOOL_NAME } from '../../tools/SendMessageTool/constants.js'
import { TEAM_CREATE_TOOL_NAME } from '../../tools/TeamCreateTool/constants.js'
import type {
  Hello2ccSessionState,
  PreconditionCheckResult,
} from './types.js'
import { getApplicableHello2ccStrategies } from './strategy.js'

function trimString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function createToolSignature(
  toolName: string,
  detail: Record<string, unknown>,
): string {
  return `${toolName}:${JSON.stringify(detail)}`
}

function block(reason: string, notes: string[] = []): PreconditionCheckResult {
  return {
    blocked: true,
    reason,
    notes,
  }
}

export function checkToolPreconditions(
  toolName: string,
  toolInput: Record<string, unknown>,
  sessionState: Hello2ccSessionState,
): PreconditionCheckResult {
  switch (toolName) {
    case TEAM_CREATE_TOOL_NAME: {
      const requestedTeamName = trimString(toolInput.team_name)
      if (
        requestedTeamName &&
        sessionState.activeTeamName &&
        requestedTeamName === sessionState.activeTeamName
      ) {
        return block(
          `Team "${requestedTeamName}" is already the active team for this session. Reuse it instead of creating the same team again.`,
          ['Blocked duplicate TeamCreate for the active team.'],
        )
      }
      break
    }
    case SEND_MESSAGE_TOOL_NAME: {
      const recipient = trimString(toolInput.to)
      if (recipient === '*' && !sessionState.activeTeamName) {
        return block(
          'Broadcast SendMessage requires an active team context. Create or restore a team before broadcasting.',
          ['Blocked team broadcast because no active team is recorded in session memory.'],
        )
      }
      break
    }
    case AGENT_TOOL_NAME: {
      const requestedIsolation = trimString(toolInput.isolation)
      if (
        requestedIsolation === 'worktree' &&
        !sessionState.capabilities.supportsWorktree
      ) {
        return block(
          'Agent worktree isolation was requested, but the current Gateway session does not expose EnterWorktree support.',
          ['Blocked Agent worktree isolation because the capability snapshot says worktree support is unavailable.'],
        )
      }
      break
    }
    case ENTER_WORKTREE_TOOL_NAME: {
      if (!sessionState.capabilities.supportsWorktree) {
        return block(
          'EnterWorktree is not available in the current Gateway capability snapshot.',
          ['Blocked EnterWorktree because the capability snapshot says worktree support is unavailable.'],
        )
      }
      if (sessionState.activeWorktreePath) {
        return block(
          `A worktree is already active for this session at ${sessionState.activeWorktreePath}. Reuse it or exit it before creating another one.`,
          ['Blocked duplicate EnterWorktree because the session already tracks an active worktree.'],
        )
      }
      break
    }
    default:
      break
  }

  const repeatedFailure = sessionState.recentFailures.find(record => {
    if (record.toolName !== toolName || record.count < 2) {
      return false
    }
    return record.signature === createToolSignature(toolName, toolInput)
  })

  if (repeatedFailure) {
    return block(
      `This ${toolName} call already failed ${repeatedFailure.count} times recently with the same input: ${repeatedFailure.summary}. Change the preconditions or the input before retrying.`,
      [
        `Blocked repeated ${toolName} retry because the same input has already failed ${repeatedFailure.count} times in this session.`,
      ],
    )
  }

  const { context, strategies } = getApplicableHello2ccStrategies(sessionState)
  const notes: string[] = []

  for (const strategy of strategies) {
    const contribution = strategy.checkPreconditions?.({
      context,
      toolName,
      toolInput,
    })
    if (!contribution) {
      continue
    }
    if (contribution.notes?.length) {
      notes.push(...contribution.notes)
    }
    if (contribution.blocked) {
      return block(contribution.reason ?? 'Blocked by hello2cc strategy.', notes)
    }
  }

  return {
    blocked: false,
    notes,
  }
}
