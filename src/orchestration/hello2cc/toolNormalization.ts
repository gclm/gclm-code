import { AGENT_TOOL_NAME } from '../../tools/AgentTool/constants.js'
import { ENTER_WORKTREE_TOOL_NAME } from '../../tools/EnterWorktreeTool/constants.js'
import { SEND_MESSAGE_TOOL_NAME } from '../../tools/SendMessageTool/constants.js'
import { TEAM_CREATE_TOOL_NAME } from '../../tools/TeamCreateTool/constants.js'
import type { Hello2ccSessionState, NormalizationResult } from './types.js'
import { suggestSubagentType } from './subagentGuidance.js'

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value
}

function summarizeText(value: string, maxLength: number): string {
  const trimmed = value.trim().replace(/\s+/g, ' ')
  if (trimmed.length <= maxLength) {
    return trimmed
  }
  return `${trimmed.slice(0, maxLength - 3)}...`
}

function shallowEqual(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
): boolean {
  const leftKeys = Object.keys(left)
  const rightKeys = Object.keys(right)
  if (leftKeys.length !== rightKeys.length) {
    return false
  }
  return leftKeys.every(key => left[key] === right[key])
}

export function normalizeToolInput(
  toolName: string,
  toolInput: Record<string, unknown>,
  sessionState: Hello2ccSessionState,
): NormalizationResult {
  const updatedInput: Record<string, unknown> = { ...toolInput }
  const notes: string[] = []

  switch (toolName) {
    case AGENT_TOOL_NAME: {
      updatedInput.description = trimString(updatedInput.description)
      updatedInput.prompt = trimString(updatedInput.prompt)
      updatedInput.name = trimString(updatedInput.name)
      updatedInput.team_name = trimString(updatedInput.team_name)
      updatedInput.subagent_type = trimString(updatedInput.subagent_type)

      if (
        typeof updatedInput.prompt === 'string' &&
        (!updatedInput.description || updatedInput.description === '')
      ) {
        updatedInput.description = summarizeText(updatedInput.prompt, 48)
        notes.push('Filled Agent.description from the task prompt so the worker is easier to route and track.')
      }

      if (
        sessionState.lastIntent?.signals.needWorktree &&
        sessionState.capabilities.supportsWorktree &&
        !updatedInput.isolation
      ) {
        updatedInput.isolation = 'worktree'
        notes.push('Enabled Agent worktree isolation because the active request explicitly asks for isolated changes.')
      }

      const guidance = suggestSubagentType(toolName, updatedInput, sessionState)
      if (guidance.subagentType && !updatedInput.subagent_type) {
        updatedInput.subagent_type = guidance.subagentType
        if (guidance.note) {
          notes.push(guidance.note)
        }
      }
      notes.push(...guidance.shapingNotes)
      break
    }
    case SEND_MESSAGE_TOOL_NAME: {
      updatedInput.to = trimString(updatedInput.to)
      updatedInput.summary = trimString(updatedInput.summary)
      if (
        typeof updatedInput.message === 'string' &&
        (!updatedInput.summary || updatedInput.summary === '')
      ) {
        updatedInput.summary = summarizeText(updatedInput.message, 48)
        notes.push('Filled SendMessage.summary from the message body so the routing preview is explicit.')
      }
      break
    }
    case TEAM_CREATE_TOOL_NAME: {
      updatedInput.team_name = trimString(updatedInput.team_name)
      updatedInput.description = trimString(updatedInput.description)
      updatedInput.agent_type = trimString(updatedInput.agent_type)
      break
    }
    case ENTER_WORKTREE_TOOL_NAME: {
      updatedInput.name = trimString(updatedInput.name)
      break
    }
    default:
      break
  }

  const repeatedFailure = sessionState.recentFailures.find(
    record => record.toolName === toolName,
  )
  if (repeatedFailure) {
    notes.push(
      `Recent session failure on ${toolName}: ${repeatedFailure.summary}`,
    )
  }

  return {
    updatedInput: shallowEqual(updatedInput, toolInput) ? undefined : updatedInput,
    notes,
  }
}
