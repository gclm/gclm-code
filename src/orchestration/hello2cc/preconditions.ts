import type { Hello2ccSessionState, PreconditionCheckResult } from './types.js'
import { shouldBlockFileEdit } from './fileEditProtection.js'

function trimString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function block(reason: string, notes: string[] = []): PreconditionCheckResult {
  return { blocked: true, reason, notes }
}

export function checkToolPreconditions(
  toolName: string,
  toolInput: Record<string, unknown>,
  state: Hello2ccSessionState,
): PreconditionCheckResult {
  // ── File edit protection (highest priority for user pain points) ──
  const fileEditBlock = shouldBlockFileEdit(state, toolName, toolInput)
  if (fileEditBlock.blocked) {
    return block(
      fileEditBlock.reason ?? 'File edit blocked by protection policy.',
      fileEditBlock.note ? [fileEditBlock.note] : [],
    )
  }

  // ── TeamCreate duplicate ──
  if (toolName === 'TeamCreate') {
    const requestedTeamName = trimString(toolInput.team_name)
    if (requestedTeamName && state.activeTeamName && requestedTeamName === state.activeTeamName) {
      return block(
        `Team "${requestedTeamName}" is already the active team. Reuse it instead of creating the same team again.`,
        ['Blocked duplicate TeamCreate for the active team.'],
      )
    }
  }

  // ── SendMessage broadcast without team ──
  if (toolName === 'SendMessage') {
    const recipient = trimString(toolInput.to)
    if (recipient === '*' && !state.activeTeamName) {
      return block(
        'Broadcast SendMessage requires an active team. Create or restore a team first.',
        ['Blocked team broadcast without active team.'],
      )
    }
  }

  // ── Agent worktree isolation without support ──
  if (toolName === 'Agent') {
    const requestedIsolation = trimString(toolInput.isolation)
    if (requestedIsolation === 'worktree' && !state.capabilities.supportsWorktree) {
      return block(
        'Agent worktree isolation requested, but EnterWorktree is not available in this session.',
        ['Blocked Agent worktree — capability not available.'],
      )
    }
  }

  // ── EnterWorktree ──
  if (toolName === 'EnterWorktree') {
    if (!state.capabilities.supportsWorktree) {
      return block(
        'EnterWorktree is not available in the current capability snapshot.',
        ['Blocked EnterWorktree — capability not available.'],
      )
    }
    if (state.activeWorktreePath) {
      return block(
        `A worktree is already active at ${state.activeWorktreePath}. Reuse it or exit first.`,
        ['Blocked duplicate EnterWorktree.'],
      )
    }
  }

  // ── Repeated same-input failure debounce ──
  const repeatedFailure = state.recentFailures.find(record => {
    if (record.toolName !== toolName || record.count < 2) return false
    return record.signature === `${toolName}:${JSON.stringify(toolInput)}`
  })

  if (repeatedFailure) {
    return block(
      `${toolName} has already failed ${repeatedFailure.count} times with the same input: ${repeatedFailure.summary}. Change preconditions before retrying.`,
      [`Blocked repeated ${toolName} retry.`],
    )
  }

  return { blocked: false, notes: [] }
}
