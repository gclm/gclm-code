import { getSessionId } from '../../bootstrap/state.js'
import { saveHello2ccState } from '../../utils/sessionStorage.js'
import { getCwd } from '../../utils/cwd.js'
import { logForDebugging } from '../../utils/debug.js'
import { extractTextContent } from '../../utils/messages.js'
import { getHello2ccExtraStrategies } from '../../utils/settings/settings.js'
import { analyzeIntentProfile } from './intentProfile.js'
import {
  buildRouteGuidance,
  buildRouteStateSnapshot,
} from './routeGuidance.js'
import { buildHello2ccObservabilitySnapshot } from './observability.js'
import {
  ensureHello2ccSessionState,
  getHello2ccSessionState,
  rememberIntentProfile,
  rememberRouteGuidance,
  rememberToolFailure,
  rememberToolSuccess,
  restoreHello2ccSessionState,
  snapshotHello2ccSessionState,
  updateHello2ccSessionState,
} from './sessionState.js'
import {
  createHello2ccStrategyFromConfig,
  registerHello2ccStrategy,
  unregisterHello2ccStrategy,
} from './strategy.js'
import { normalizeToolInput } from './toolNormalization.js'
import { checkToolPreconditions } from './preconditions.js'

export { registerHello2ccHooks } from './hooks.js'
export { restoreHello2ccSessionState } from './sessionState.js'
export { registerHello2ccStrategy } from './strategy.js'

let syncedConfiguredStrategyIds = new Set<string>()

function syncConfiguredHello2ccStrategies(): void {
  const configuredStrategies = getHello2ccExtraStrategies() ?? []
  const nextConfiguredStrategyIds = new Set<string>()

  for (const strategy of configuredStrategies) {
    if (strategy.enabled === false) {
      continue
    }
    nextConfiguredStrategyIds.add(strategy.id)
    registerHello2ccStrategy(createHello2ccStrategyFromConfig(strategy))
  }

  for (const strategyId of syncedConfiguredStrategyIds) {
    if (!nextConfiguredStrategyIds.has(strategyId)) {
      unregisterHello2ccStrategy(strategyId)
    }
  }

  syncedConfiguredStrategyIds = nextConfiguredStrategyIds
}

function summarizeToolPayload(payload: unknown): string {
  if (typeof payload === 'string') {
    return payload.slice(0, 160)
  }
  if (!payload || typeof payload !== 'object') {
    return 'completed without structured result details'
  }

  const candidate = payload as Record<string, unknown>
  if (typeof candidate.message === 'string') {
    return candidate.message.slice(0, 160)
  }
  if (typeof candidate.team_name === 'string') {
    return candidate.team_name
  }
  if (typeof candidate.worktreePath === 'string') {
    return candidate.worktreePath
  }
  if (typeof candidate.status === 'string') {
    return `status=${candidate.status}`
  }
  return `keys=${Object.keys(candidate).slice(0, 5).join(', ')}`
}

function getLatestPromptText(
  messages: readonly { type?: string; content?: unknown; isMeta?: boolean }[],
): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.type !== 'user' || message.isMeta) {
      continue
    }
    const content = Array.isArray(message.content)
      ? extractTextContent(message.content)
      : typeof message.content === 'string'
        ? message.content
        : ''
    if (content.trim().length > 0) {
      return content
    }
  }
  return ''
}

export function buildGatewayOrchestrationContext(params: {
  messages: readonly { type?: string; content?: unknown; isMeta?: boolean }[]
  userContext: Record<string, string>
  systemContext: Record<string, string>
  model?: string
  availableSubagentTypes?: string[]
  mcpConnectedCount?: number
  mcpPendingCount?: number
  mcpNeedsAuthCount?: number
  mcpFailedCount?: number
  toolSearchOptimistic?: boolean
  webSearchAvailable?: boolean
  webSearchRequests?: number
  provider?: string
  strategyProfile?: 'balanced' | 'strict'
  qualityGateMode?: 'off' | 'advisory' | 'strict'
  providerPoliciesEnabled?: boolean
}): {
  userContext: Record<string, string>
  systemContext: Record<string, string>
} {
  syncConfiguredHello2ccStrategies()
  const sessionId = getSessionId()
  const sessionState = ensureHello2ccSessionState({
    sessionId,
    cwd: getCwd(),
    model: params.model,
    availableSubagentTypes: params.availableSubagentTypes,
    mcpConnectedCount: params.mcpConnectedCount,
    mcpPendingCount: params.mcpPendingCount,
    mcpNeedsAuthCount: params.mcpNeedsAuthCount,
    mcpFailedCount: params.mcpFailedCount,
    toolSearchOptimistic: params.toolSearchOptimistic,
    webSearchAvailable: params.webSearchAvailable,
    webSearchRequests: params.webSearchRequests,
    provider: params.provider,
    strategyProfile: params.strategyProfile,
    qualityGateMode: params.qualityGateMode,
    providerPoliciesEnabled: params.providerPoliciesEnabled,
  })
  const latestPrompt = getLatestPromptText(params.messages)
  if (!latestPrompt) {
    return {
      userContext: params.userContext,
      systemContext: params.systemContext,
    }
  }

  const intentProfile = analyzeIntentProfile(latestPrompt)
  const nextState =
    rememberIntentProfile(sessionId, intentProfile) ?? sessionState
  const routeGuidance = buildRouteGuidance(nextState, intentProfile)
  const finalState =
    rememberRouteGuidance(sessionId, routeGuidance) ?? nextState

  const snapshot = buildHello2ccObservabilitySnapshot(finalState)
  logForDebugging(
    `[hello2cc] built route guidance for session ${sessionId}: ${JSON.stringify({
      intent: intentProfile.primaryIntent,
      mcp: snapshot.hostFacts.mcp,
      toolSearchOptimistic: snapshot.hostFacts.toolSearchOptimistic,
      webSearchRequests: snapshot.hostFacts.webSearchRequests,
      provider: snapshot.hostFacts.provider,
      strategyProfile: snapshot.hostFacts.strategyProfile,
      qualityGateMode: snapshot.hostFacts.qualityGateMode,
      activeStrategies: snapshot.strategySurface.activeStrategyIds,
      activeTeamName: snapshot.sessionAnchors.activeTeamName,
      recentSuccessCount: snapshot.memoryPressure.recentSuccessCount,
      recentFailureCount: snapshot.memoryPressure.recentFailureCount,
    })}`,
  )
  saveHello2ccState(snapshotHello2ccSessionState(finalState))

  return {
    userContext: {
      ...params.userContext,
      gateway_orchestration_state: buildRouteStateSnapshot(finalState),
    },
    systemContext: {
      ...params.systemContext,
      gateway_orchestration: routeGuidance,
    },
  }
}

export function normalizeGatewayToolInput(params: {
  toolName: string
  input: Record<string, unknown>
}): Record<string, unknown> {
  syncConfiguredHello2ccStrategies()
  const sessionState = ensureHello2ccSessionState({
    sessionId: getSessionId(),
    cwd: getCwd(),
  })
  const normalization = normalizeToolInput(
    params.toolName,
    params.input,
    sessionState,
  )
  if (normalization.updatedInput || normalization.notes.length > 0) {
    logForDebugging(
      `[hello2cc] normalized ${params.toolName}: changed=${normalization.updatedInput ? 'yes' : 'no'}, notes=${normalization.notes.join(' | ') || 'none'}`,
    )
  }
  return normalization.updatedInput ?? params.input
}

export function checkGatewayToolPreconditions(params: {
  toolName: string
  input: Record<string, unknown>
}): {
  blocked: boolean
  reason?: string
} {
  syncConfiguredHello2ccStrategies()
  const sessionState = ensureHello2ccSessionState({
    sessionId: getSessionId(),
    cwd: getCwd(),
  })
  const result = checkToolPreconditions(
    params.toolName,
    params.input,
    sessionState,
  )
  if (result.blocked || result.notes.length > 0) {
    logForDebugging(
      `[hello2cc] checked preconditions for ${params.toolName}: blocked=${result.blocked ? 'yes' : 'no'}, notes=${result.notes.join(' | ') || 'none'}`,
    )
  }
  return {
    blocked: result.blocked,
    reason: result.reason,
  }
}

export function rememberGatewayToolSuccess(params: {
  toolName: string
  input: Record<string, unknown>
  output: unknown
}): void {
  syncConfiguredHello2ccStrategies()
  const sessionId = getSessionId()
  const nextState = rememberToolSuccess(
    sessionId,
    params.toolName,
    params.input,
    summarizeToolPayload(params.output),
  )
  if (!nextState) {
    return
  }

  logForDebugging(
    `[hello2cc] remembered tool success: tool=${params.toolName}, successes=${nextState.recentSuccesses.length}, failures=${nextState.recentFailures.length}`,
  )

  const finalState = updateHello2ccSessionState(sessionId, state => {
    const updated = { ...state }
    if (
      params.toolName === 'TeamCreate' &&
      params.output &&
      typeof params.output === 'object' &&
      typeof (params.output as { team_name?: unknown }).team_name === 'string'
    ) {
      updated.activeTeamName = (params.output as { team_name: string }).team_name
    }
    if (
      params.toolName === 'EnterWorktree' &&
      params.output &&
      typeof params.output === 'object' &&
      typeof (params.output as { worktreePath?: unknown }).worktreePath ===
        'string'
    ) {
      updated.activeWorktreePath = (
        params.output as { worktreePath: string }
      ).worktreePath
    }
    return updated
  })
  saveHello2ccState(snapshotHello2ccSessionState(finalState))
}

export function rememberGatewayToolFailure(params: {
  toolName: string
  input: Record<string, unknown>
  error: string
}): void {
  syncConfiguredHello2ccStrategies()
  const nextState = rememberToolFailure(
    getSessionId(),
    params.toolName,
    params.input,
    params.error,
  )
  if (!nextState) {
    return
  }

  logForDebugging(
    `[hello2cc] remembered tool failure: tool=${params.toolName}, failureCount=${nextState.toolFailureCounts[params.toolName] ?? 0}, recentFailures=${nextState.recentFailures.length}`,
  )
  saveHello2ccState(snapshotHello2ccSessionState(nextState))
}

export function getGatewayOrchestrationState() {
  syncConfiguredHello2ccStrategies()
  return getHello2ccSessionState(getSessionId())
}
