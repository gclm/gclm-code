import type { Hello2ccIntentProfile, Hello2ccSessionState } from './types.js'
import { getApplicableHello2ccStrategies } from './strategy.js'

function formatList(values: string[]): string {
  return values.join(', ')
}

function summarizeMemory(
  values: Hello2ccSessionState['recentFailures'] | Hello2ccSessionState['recentSuccesses'],
): string | undefined {
  const recent = values.slice(0, 2).map(record => `${record.toolName}: ${record.summary}`)
  return recent.length > 0 ? recent.join(' | ') : undefined
}

export function buildSessionStartContext(
  sessionState: Hello2ccSessionState,
): string {
  const capabilities = sessionState.capabilities
  const { context, strategies } = getApplicableHello2ccStrategies(sessionState)
  return [
    'Gateway orchestration snapshot:',
    `- surfaced capabilities: ${formatList(capabilities.toolNames)}`,
    `- current cwd: ${capabilities.cwd}`,
    capabilities.model ? `- current model slot: ${capabilities.model}` : undefined,
    capabilities.provider ? `- current provider: ${capabilities.provider}` : undefined,
    `- strategy profile: ${capabilities.strategyProfile ?? 'balanced'}`,
    `- quality gate mode: ${capabilities.qualityGateMode ?? 'advisory'}`,
    `- provider policies: ${capabilities.providerPoliciesEnabled === false ? 'disabled' : 'enabled'}`,
    ...strategies.flatMap(
      strategy =>
        strategy.buildSessionStartLines?.({ context }) ?? [],
    ),
    '- routing policy: prefer the shortest host-supported path before inventing new provider or gateway behavior.',
    '- use Agent for bounded implementation or exploration, TeamCreate only for clearly parallelizable work, SendMessage to continue an existing worker, and EnterWorktree when isolated edits are explicitly requested or materially reduce risk.',
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildRouteGuidance(
  sessionState: Hello2ccSessionState,
  intentProfile: Hello2ccIntentProfile,
): string {
  const recommendations: string[] = []
  const capabilities = sessionState.capabilities
  const { context, strategies } = getApplicableHello2ccStrategies(sessionState)

  switch (intentProfile.primaryIntent) {
    case 'implement':
      recommendations.push('prefer implementation-oriented tool paths over abstract discussion')
      break
    case 'review':
      recommendations.push('prefer risk-finding and verification over code generation')
      break
    case 'verify':
      recommendations.push('prefer running or describing concrete validation paths')
      break
    case 'plan':
      recommendations.push('prefer outlining phases and boundaries before editing code')
      break
    case 'explore':
      recommendations.push('prefer reading code and reconstructing behavior before proposing changes')
      break
    default:
      recommendations.push('prefer the shortest path that matches the user request and current host capabilities')
      break
  }

  if (capabilities.supportsAgent && intentProfile.signals.implement) {
    recommendations.push('Agent is available for bounded implementation or focused exploration tasks')
  }
  if (capabilities.supportsTeam && intentProfile.signals.needTeam) {
    recommendations.push('TeamCreate is available, but only use it when the work can be split into independent parallel streams')
  }
  if (capabilities.supportsWorktree && intentProfile.signals.needWorktree) {
    recommendations.push('EnterWorktree is available and matches the request for isolated changes')
  }
  if (capabilities.supportsMessaging) {
    recommendations.push('SendMessage can continue an existing worker instead of spawning a duplicate')
  }
  recommendations.push(
    ...strategies.flatMap(
      strategy =>
        strategy.buildRouteRecommendations?.({
          context,
          intentProfile,
        }) ?? [],
    ),
  )
  if (intentProfile.signals.externalSystem) {
    recommendations.push('avoid inventing unsupported provider, login, or gateway behavior; stay within current project contracts')
  }

  const successSummary = summarizeMemory(sessionState.recentSuccesses)
  const failureSummary = summarizeMemory(sessionState.recentFailures)

  return [
    'Gateway orchestration guidance:',
    `- detected intent: ${intentProfile.primaryIntent}`,
    `- surfaced capabilities this session: ${formatList(capabilities.toolNames)}`,
    sessionState.activeTeamName
      ? `- active team already present: ${sessionState.activeTeamName}`
      : undefined,
    sessionState.activeWorktreePath
      ? `- active worktree already present: ${sessionState.activeWorktreePath}`
      : undefined,
    `- recommended path: ${recommendations.join('; ')}`,
    failureSummary ? `- recent failures to avoid repeating: ${failureSummary}` : undefined,
    successSummary ? `- recent successful paths: ${successSummary}` : undefined,
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildRouteStateSnapshot(
  sessionState: Hello2ccSessionState,
): string {
  return JSON.stringify(
    {
      capabilities: sessionState.capabilities.toolNames,
      hostFacts: {
        availableSubagentTypes: sessionState.capabilities.availableSubagentTypes,
        mcpConnectedCount: sessionState.capabilities.mcpConnectedCount,
        mcpPendingCount: sessionState.capabilities.mcpPendingCount,
        mcpNeedsAuthCount: sessionState.capabilities.mcpNeedsAuthCount,
        mcpFailedCount: sessionState.capabilities.mcpFailedCount,
        toolSearchOptimistic: sessionState.capabilities.toolSearchOptimistic,
        webSearchAvailable: sessionState.capabilities.webSearchAvailable,
        webSearchRequests: sessionState.capabilities.webSearchRequests,
        provider: sessionState.capabilities.provider,
        strategyProfile: sessionState.capabilities.strategyProfile,
        qualityGateMode: sessionState.capabilities.qualityGateMode,
        providerPoliciesEnabled:
          sessionState.capabilities.providerPoliciesEnabled,
      },
      activeTeamName: sessionState.activeTeamName,
      activeWorktreePath: sessionState.activeWorktreePath,
      recentSuccesses: sessionState.recentSuccesses
        .slice(0, 3)
        .map(record => ({ toolName: record.toolName, summary: record.summary })),
      recentFailures: sessionState.recentFailures
        .slice(0, 3)
        .map(record => ({ toolName: record.toolName, summary: record.summary })),
      toolFailureCounts: sessionState.toolFailureCounts,
    },
    null,
    2,
  )
}
