import type { PersistedHello2ccSessionState } from './types.js'
import { buildHello2ccObservabilitySnapshot } from './observability.js'

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

export function buildHello2ccHealthSummary(
  state: PersistedHello2ccSessionState | undefined,
): string | undefined {
  if (!state) {
    return undefined
  }

  const parts: string[] = []

  if (state.lastIntent?.primaryIntent) {
    parts.push(`intent=${state.lastIntent.primaryIntent}`)
  }

  parts.push(`${state.capabilities.toolNames.length} capabilities`)

  const observability = buildHello2ccObservabilitySnapshot(state)
  if (observability.hostFacts.mcp.connected > 0) {
    parts.push(`${observability.hostFacts.mcp.connected} MCP connected`)
  }

  if (state.activeTeamName) {
    parts.push(`team=${state.activeTeamName}`)
  }

  if (state.activeWorktreePath) {
    parts.push('worktree=active')
  }

  if (state.recentSuccesses.length > 0) {
    parts.push(pluralize(state.recentSuccesses.length, 'success'))
  }

  if (state.recentFailures.length > 0) {
    parts.push(pluralize(state.recentFailures.length, 'failure'))
  }

  const failureTotal = Object.values(state.toolFailureCounts).reduce(
    (sum, count) => sum + count,
    0,
  )
  if (failureTotal > 0) {
    parts.push(`${failureTotal} total retries`)
  }

  return parts.join(' · ')
}

export function buildHello2ccResumeSummary(
  state: PersistedHello2ccSessionState | undefined,
  style: 'detailed' | 'compact' = 'detailed',
): string | undefined {
  if (!state) {
    return undefined
  }

  if (style === 'compact') {
    const compactSummary = buildHello2ccHealthSummary(state)
    return compactSummary
      ? `Restored hello2cc orchestration memory: ${compactSummary}`
      : undefined
  }

  const details: string[] = []

  if (state.activeTeamName) {
    details.push(`team=${state.activeTeamName}`)
  }

  if (state.activeWorktreePath) {
    details.push(`worktree=${state.activeWorktreePath}`)
  }

  if (state.lastIntent?.primaryIntent) {
    details.push(`intent=${state.lastIntent.primaryIntent}`)
  }

  if (state.recentSuccesses.length > 0) {
    details.push(pluralize(state.recentSuccesses.length, 'success'))
  }

  if (state.recentFailures.length > 0) {
    details.push(pluralize(state.recentFailures.length, 'failure'))
  }

  const capabilityCount = state.capabilities.toolNames.length
  details.push(`${capabilityCount} capabilities`)

  return `Restored hello2cc orchestration memory: ${details.join(' · ')}`
}
