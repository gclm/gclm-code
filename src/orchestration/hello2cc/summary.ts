import type { PersistedHello2ccSessionState } from './types.js'
import { buildHello2ccObservabilitySnapshot } from './observability.js'

function pluralize(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`
}

function formatRelativeTimestamp(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  if (diffMs < 60_000) return 'just now'
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)}m ago`
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)}h ago`
  return `${Math.floor(diffMs / 86_400_000)}d ago`
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

  if (state.recentFailures.length > 0) {
    const lastFailure = state.recentFailures[0]
    parts.push(`lastFailure=${lastFailure.toolName}(${formatRelativeTimestamp(lastFailure.updatedAt)})`)
  }

  if (state.lastRouteGuidance) {
    const guidancePreview = state.lastRouteGuidance.slice(0, 60).replace(/\n/g, ' ')
    parts.push(`guidance="${guidancePreview}${state.lastRouteGuidance.length > 60 ? '...' : ''}"`)
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
    const lastFailure = state.recentFailures[0]
    details.push(`lastFailure=${lastFailure.toolName}(${formatRelativeTimestamp(lastFailure.updatedAt)})`)
  }

  if (state.lastRouteGuidance) {
    const guidancePreview = state.lastRouteGuidance.slice(0, 60).replace(/\n/g, ' ')
    details.push(`guidance="${guidancePreview}${state.lastRouteGuidance.length > 60 ? '...' : ''}"`)
  }

  const capabilityCount = state.capabilities.toolNames.length
  details.push(`${capabilityCount} capabilities`)

  return `Restored hello2cc orchestration memory: ${details.join(' · ')}`
}
