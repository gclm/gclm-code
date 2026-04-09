import type { Hello2ccIntentProfile, Hello2ccSessionState } from './types.js'
import { buildUniversalGuidance, formatGuidanceForSystemContext, formatGuidanceAsJsonSnapshot } from './universalStrategy.js'

export function buildSessionStartContext(state: Hello2ccSessionState): string {
  const caps = state.capabilities
  const lines = [
    'Gateway capability snapshot:',
    `- available tools: ${caps.toolNames.join(', ')}`,
    `- cwd: ${caps.cwd}`,
  ]
  if (caps.model) lines.push(`- model: ${caps.model}`)
  if (caps.provider) lines.push(`- provider: ${caps.provider}`)
  lines.push(
    `- strategy profile: ${caps.profile}`,
    '- routing policy: prefer the shortest host-supported path before inventing new behavior.',
  )
  return lines.join('\n')
}

export function buildRouteGuidance(
  state: Hello2ccSessionState,
  intent: Hello2ccIntentProfile,
): string {
  const guidance = buildUniversalGuidance(state, intent)
  return formatGuidanceForSystemContext(guidance)
}

export function buildRouteStateSnapshot(state: Hello2ccSessionState): string {
  return JSON.stringify(
    {
      capabilities: state.capabilities.toolNames,
      hostFacts: {
        availableSubagentTypes: state.capabilities.availableSubagentTypes,
        mcpConnectedCount: state.capabilities.mcpConnectedCount,
        mcpPendingCount: state.capabilities.mcpPendingCount,
        mcpNeedsAuthCount: state.capabilities.mcpNeedsAuthCount,
        mcpFailedCount: state.capabilities.mcpFailedCount,
        toolSearchOptimistic: state.capabilities.toolSearchOptimistic,
        webSearchAvailable: state.capabilities.webSearchAvailable,
        webSearchRequests: state.capabilities.webSearchRequests,
        provider: state.capabilities.provider,
        strategyProfile: state.capabilities.profile,
      },
      activeTeamName: state.activeTeamName,
      activeWorktreePath: state.activeWorktreePath,
      recentSuccesses: state.recentSuccesses.slice(0, 3).map(r => ({ toolName: r.toolName, summary: r.summary })),
      recentFailures: state.recentFailures.slice(0, 3).map(r => ({ toolName: r.toolName, summary: r.summary })),
      toolFailureCounts: state.toolFailureCounts,
      fileEditFailures: state.fileEditFailures.map(f => ({ filePath: f.filePath, errorType: f.errorType, count: f.count })),
    },
    null,
    2,
  )
}

export function buildRouteGuidanceJsonSnapshot(
  state: Hello2ccSessionState,
  intent: Hello2ccIntentProfile,
): string {
  const guidance = buildUniversalGuidance(state, intent)
  return formatGuidanceAsJsonSnapshot(guidance)
}
