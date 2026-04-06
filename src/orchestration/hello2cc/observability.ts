import type { Hello2ccSessionState } from './types.js'
import { getApplicableHello2ccStrategies } from './strategy.js'

type Hello2ccObservabilitySnapshot = {
  hostFacts: {
    surfacedCapabilities: string[]
    availableSubagentTypes: string[]
    mcp: {
      connected: number
      pending: number
      needsAuth: number
      failed: number
    }
    toolSearchOptimistic: boolean
    webSearchAvailable: boolean
    webSearchRequests: number
    provider?: string
    strategyProfile?: 'balanced' | 'strict'
    qualityGateMode?: 'off' | 'advisory' | 'strict'
    providerPoliciesEnabled?: boolean
  }
  sessionAnchors: {
    intent?: string
    activeTeamName?: string
    activeWorktreePath?: string
  }
  strategySurface: {
    activeStrategyIds: string[]
  }
  memoryPressure: {
    recentSuccessCount: number
    recentFailureCount: number
    totalRetries: number
    topFailureTool?: string
  }
}

export function buildHello2ccObservabilitySnapshot(
  state: Hello2ccSessionState,
): Hello2ccObservabilitySnapshot {
  const { strategies } = getApplicableHello2ccStrategies(state)
  const totalRetries = Object.values(state.toolFailureCounts).reduce(
    (sum, count) => sum + count,
    0,
  )
  const topFailureEntry = Object.entries(state.toolFailureCounts)
    .filter(([, count]) => count > 0)
    .sort((left, right) => right[1] - left[1])[0]

  return {
    hostFacts: {
      surfacedCapabilities: state.capabilities.toolNames,
      availableSubagentTypes: state.capabilities.availableSubagentTypes,
      mcp: {
        connected: state.capabilities.mcpConnectedCount,
        pending: state.capabilities.mcpPendingCount,
        needsAuth: state.capabilities.mcpNeedsAuthCount,
        failed: state.capabilities.mcpFailedCount,
      },
      toolSearchOptimistic: state.capabilities.toolSearchOptimistic,
      webSearchAvailable: state.capabilities.webSearchAvailable,
      webSearchRequests: state.capabilities.webSearchRequests,
      provider: state.capabilities.provider,
      strategyProfile: state.capabilities.strategyProfile,
      qualityGateMode: state.capabilities.qualityGateMode,
      providerPoliciesEnabled: state.capabilities.providerPoliciesEnabled,
    },
    sessionAnchors: {
      intent: state.lastIntent?.primaryIntent,
      activeTeamName: state.activeTeamName,
      activeWorktreePath: state.activeWorktreePath,
    },
    strategySurface: {
      activeStrategyIds: strategies.map(strategy => strategy.id),
    },
    memoryPressure: {
      recentSuccessCount: state.recentSuccesses.length,
      recentFailureCount: state.recentFailures.length,
      totalRetries,
      topFailureTool: topFailureEntry?.[0],
    },
  }
}

export function formatHello2ccHostFacts(
  state: Hello2ccSessionState,
): string[] {
  const snapshot = buildHello2ccObservabilitySnapshot(state)
  const hostFacts = snapshot.hostFacts
  const lines = [
    `MCP connected=${hostFacts.mcp.connected}, auth=${hostFacts.mcp.needsAuth}, pending=${hostFacts.mcp.pending}, failed=${hostFacts.mcp.failed}`,
    `tool search optimistic=${hostFacts.toolSearchOptimistic ? 'yes' : 'no'}`,
    `web search available=${hostFacts.webSearchAvailable ? 'yes' : 'no'}, requests=${hostFacts.webSearchRequests}`,
    `provider=${hostFacts.provider ?? 'unknown'}, strategy=${hostFacts.strategyProfile ?? 'balanced'}, qualityGate=${hostFacts.qualityGateMode ?? 'advisory'}`,
  ]

  if (hostFacts.availableSubagentTypes.length > 0) {
    lines.push(`subagents=${hostFacts.availableSubagentTypes.join(', ')}`)
  }

  return lines
}

export function formatHello2ccRoutingPosture(
  state: Hello2ccSessionState,
): string[] {
  const snapshot = buildHello2ccObservabilitySnapshot(state)
  const posture = [
    `intent=${snapshot.sessionAnchors.intent ?? 'unknown'}`,
    snapshot.sessionAnchors.activeTeamName
      ? `team=${snapshot.sessionAnchors.activeTeamName}`
      : 'team=none',
    snapshot.sessionAnchors.activeWorktreePath
      ? `worktree=${snapshot.sessionAnchors.activeWorktreePath}`
      : 'worktree=none',
    `successes=${snapshot.memoryPressure.recentSuccessCount}`,
    `failures=${snapshot.memoryPressure.recentFailureCount}`,
    `retries=${snapshot.memoryPressure.totalRetries}`,
  ]

  if (snapshot.memoryPressure.topFailureTool) {
    posture.push(`topFailureTool=${snapshot.memoryPressure.topFailureTool}`)
  }

  if (snapshot.strategySurface.activeStrategyIds.length > 0) {
    posture.push(
      `strategies=${snapshot.strategySurface.activeStrategyIds.join(',')}`,
    )
  }

  return posture
}

export function buildHello2ccDebugDump(
  state: Hello2ccSessionState,
): string {
  const snapshot = buildHello2ccObservabilitySnapshot(state)

  return JSON.stringify(
    {
      sessionId: state.sessionId,
      hostFacts: snapshot.hostFacts,
      sessionAnchors: snapshot.sessionAnchors,
      strategySurface: snapshot.strategySurface,
      memoryPressure: snapshot.memoryPressure,
      recentSuccesses: state.recentSuccesses.slice(0, 5).map(record => ({
        toolName: record.toolName,
        summary: record.summary,
        count: record.count,
      })),
      recentFailures: state.recentFailures.slice(0, 5).map(record => ({
        toolName: record.toolName,
        summary: record.summary,
        count: record.count,
      })),
      toolFailureCounts: state.toolFailureCounts,
    },
    null,
    2,
  )
}

function summarizeRecords(
  records: Hello2ccSessionState['recentSuccesses'] | Hello2ccSessionState['recentFailures'],
): string[] {
  return records
    .slice(0, 3)
    .map(
      record => `- ${record.toolName}: ${record.summary} (x${record.count})`,
    )
}

function getHello2ccDiagnosticSeverity(
  snapshot: Hello2ccObservabilitySnapshot,
): 'low' | 'medium' | 'high' {
  if (
    snapshot.memoryPressure.totalRetries >= 3 ||
    snapshot.hostFacts.mcp.failed > 0
  ) {
    return 'high'
  }

  if (
    snapshot.hostFacts.mcp.needsAuth > 0 ||
    snapshot.memoryPressure.recentFailureCount > 0
  ) {
    return 'medium'
  }

  return 'low'
}

function buildHello2ccDetectedAnomalies(
  snapshot: Hello2ccObservabilitySnapshot,
): string[] {
  const anomalies: string[] = []

  if (snapshot.memoryPressure.totalRetries >= 3) {
    anomalies.push(
      `retry pressure is elevated (${snapshot.memoryPressure.totalRetries} retries recorded in this session)`,
    )
  }

  if (snapshot.hostFacts.mcp.failed > 0) {
    anomalies.push(
      `some MCP servers are in failed state (${snapshot.hostFacts.mcp.failed} failed)`,
    )
  }

  if (snapshot.hostFacts.mcp.needsAuth > 0) {
    anomalies.push(
      `MCP auth is still pending for ${snapshot.hostFacts.mcp.needsAuth} server(s)`,
    )
  }

  if (snapshot.sessionAnchors.activeTeamName) {
    anomalies.push(
      `active team reuse opportunity detected (${snapshot.sessionAnchors.activeTeamName})`,
    )
  }

  if (snapshot.sessionAnchors.activeWorktreePath) {
    anomalies.push(
      `active worktree reuse opportunity detected (${snapshot.sessionAnchors.activeWorktreePath})`,
    )
  }

  if (!snapshot.hostFacts.toolSearchOptimistic) {
    anomalies.push('tool search confidence is low, so routing may need more explicit tool names')
  }

  return anomalies
}

function buildHello2ccSuggestedActions(
  snapshot: Hello2ccObservabilitySnapshot,
): string[] {
  const actions: string[] = []

  if (snapshot.memoryPressure.totalRetries >= 3) {
    actions.push(
      'inspect repeated failures before starting another implementation hop, and compare them against current preconditions first',
    )
  }

  if (snapshot.sessionAnchors.activeTeamName) {
    actions.push(
      `reuse SendMessage with the active team (${snapshot.sessionAnchors.activeTeamName}) before creating another worker set`,
    )
  }

  if (snapshot.sessionAnchors.activeWorktreePath) {
    actions.push(
      `reuse the tracked worktree (${snapshot.sessionAnchors.activeWorktreePath}) unless you explicitly need a fresh branch of execution`,
    )
  }

  if (snapshot.hostFacts.mcp.failed > 0) {
    actions.push(
      'treat failed MCP-backed routes as unavailable until the failure is cleared or a non-MCP path is chosen',
    )
  } else if (snapshot.hostFacts.mcp.needsAuth > 0) {
    actions.push(
      'avoid MCP-dependent routes until the pending auth is cleared, or choose a route that stays inside built-in tools',
    )
  }

  if (!snapshot.hostFacts.toolSearchOptimistic) {
    actions.push(
      'keep tool routing explicit by naming the target tool and the expected output shape in the prompt',
    )
  }

  actions.push(
    'use `/hello2cc both` when you want the human summary plus the raw JSON snapshot for AI-assisted diagnosis',
  )

  return actions
}

export function buildHello2ccDiagnosticSummary(
  state: Hello2ccSessionState,
): string {
  const snapshot = buildHello2ccObservabilitySnapshot(state)
  const severity = getHello2ccDiagnosticSeverity(snapshot)
  const anomalies = buildHello2ccDetectedAnomalies(snapshot)
  const suggestedActions = buildHello2ccSuggestedActions(snapshot)
  const lines = [
    'hello2cc diagnostic summary',
    '',
    'Session',
    `- sessionId=${state.sessionId}`,
    `- intent=${snapshot.sessionAnchors.intent ?? 'unknown'}`,
    snapshot.sessionAnchors.activeTeamName
      ? `- activeTeam=${snapshot.sessionAnchors.activeTeamName}`
      : '- activeTeam=none',
    snapshot.sessionAnchors.activeWorktreePath
      ? `- activeWorktree=${snapshot.sessionAnchors.activeWorktreePath}`
      : '- activeWorktree=none',
    '',
    'Host facts',
    ...formatHello2ccHostFacts(state).map(line => `- ${line}`),
    '',
    'Routing posture',
    ...formatHello2ccRoutingPosture(state).map(line => `- ${line}`),
    '',
    'Severity',
    `- ${severity}`,
    '',
    'Detected anomalies',
    ...(anomalies.length > 0 ? anomalies.map(item => `- ${item}`) : ['- none']),
    '',
    'Recent successes',
    ...(state.recentSuccesses.length > 0
      ? summarizeRecords(state.recentSuccesses)
      : ['- none']),
    '',
    'Recent failures',
    ...(state.recentFailures.length > 0
      ? summarizeRecords(state.recentFailures)
      : ['- none']),
    '',
    'Suggested actions',
    ...suggestedActions.map(item => `- ${item}`),
  ]

  return lines.join('\n')
}
