import type { Hello2ccIntentProfile, Hello2ccSessionState } from './types.js'
import { defaultHello2ccStrategies } from './defaultStrategies.js'

type Hello2ccStrategyContext = {
  sessionState: Hello2ccSessionState
  strategyProfile: 'balanced' | 'strict'
  qualityGateMode: 'off' | 'advisory' | 'strict'
  providerPoliciesEnabled: boolean
  sessionId: string
  cwd: string
  provider?: string
  model?: string
}

export type Hello2ccStrategyScope = {
  sessionIds?: string[]
  cwdPrefixes?: string[]
  providers?: string[]
  modelPatterns?: string[]
  strategyProfiles?: Array<'balanced' | 'strict'>
  qualityGateModes?: Array<'off' | 'advisory' | 'strict'>
}

export type Hello2ccDeclarativeActivation = {
  intents?: Array<'implement' | 'review' | 'verify' | 'plan' | 'explore' | 'other'>
  minRetryPressure?: number
  requireActiveTeam?: boolean
  requireActiveWorktree?: boolean
}

export type Hello2ccStrategySubagentGuidance = {
  subagentType?: 'Explore' | 'Plan'
  note?: string
  shapingNotes?: string[]
}

export type Hello2ccStrategyPreconditionResult = {
  blocked?: boolean
  reason?: string
  notes?: string[]
}

export type Hello2ccStrategy = {
  id: string
  priority?: number
  scope?: Hello2ccStrategyScope
  when?: (context: Hello2ccStrategyContext) => boolean
  buildSessionStartLines?: (params: {
    context: Hello2ccStrategyContext
  }) => string[]
  buildRouteRecommendations?: (params: {
    context: Hello2ccStrategyContext
    intentProfile: Hello2ccIntentProfile
  }) => string[]
  suggestSubagentGuidance?: (params: {
    context: Hello2ccStrategyContext
    toolName: string
    toolInput: Record<string, unknown>
  }) => Hello2ccStrategySubagentGuidance | undefined
  checkPreconditions?: (params: {
    context: Hello2ccStrategyContext
    toolName: string
    toolInput: Record<string, unknown>
  }) => Hello2ccStrategyPreconditionResult | undefined
}

export type Hello2ccDeclarativeStrategyConfig = {
  id: string
  enabled?: boolean
  priority?: number
  activation?: Hello2ccDeclarativeActivation
  sessionStartLines?: string[]
  routeRecommendations?: string[]
  subagentGuidance?: {
    toolNames?: string[]
    subagentType?: 'Explore' | 'Plan'
    note?: string
    shapingNotes?: string[]
  }
  preconditions?: Array<{
    toolNames?: string[]
    minRetryPressure?: number
    repeatedFailureCountAtLeast?: number
    requireActiveTeam?: boolean
    requireActiveWorktree?: boolean
    block?: boolean
    reason?: string
    notes?: string[]
  }>
  scope?: Hello2ccStrategyScope
}

const strategyRegistry: Hello2ccStrategy[] = []
let defaultStrategiesInitialized = false

export function registerHello2ccStrategy(strategy: Hello2ccStrategy): void {
  const existingIndex = strategyRegistry.findIndex(
    candidate => candidate.id === strategy.id,
  )
  if (existingIndex >= 0) {
    strategyRegistry.splice(existingIndex, 1, strategy)
    return
  }
  strategyRegistry.push(strategy)
}

export function unregisterHello2ccStrategy(id: string): void {
  const existingIndex = strategyRegistry.findIndex(
    candidate => candidate.id === id,
  )
  if (existingIndex >= 0) {
    strategyRegistry.splice(existingIndex, 1)
  }
}

export function createHello2ccStrategyFromConfig(
  config: Hello2ccDeclarativeStrategyConfig,
): Hello2ccStrategy {
  const matchesActivation = (context: Hello2ccStrategyContext): boolean => {
    if (!config.activation) {
      return true
    }

    const intent = context.sessionState.lastIntent?.primaryIntent ?? 'other'
    if (
      config.activation.intents &&
      !config.activation.intents.includes(intent)
    ) {
      return false
    }

    const totalRetries = Object.values(
      context.sessionState.toolFailureCounts,
    ).reduce((sum, count) => sum + count, 0)
    if (
      typeof config.activation.minRetryPressure === 'number' &&
      totalRetries < config.activation.minRetryPressure
    ) {
      return false
    }

    if (
      config.activation.requireActiveTeam === true &&
      !context.sessionState.activeTeamName
    ) {
      return false
    }

    if (
      config.activation.requireActiveWorktree === true &&
      !context.sessionState.activeWorktreePath
    ) {
      return false
    }

    return true
  }

  return {
    id: config.id,
    priority: config.priority,
    scope: config.scope,
    when(context) {
      return matchesActivation(context)
    },
    buildSessionStartLines() {
      return config.sessionStartLines ?? []
    },
    buildRouteRecommendations() {
      return config.routeRecommendations ?? []
    },
    suggestSubagentGuidance({ toolName }) {
      const guidance = config.subagentGuidance
      if (!guidance) {
        return undefined
      }
      if (guidance.toolNames && !guidance.toolNames.includes(toolName)) {
        return undefined
      }
      return {
        subagentType: guidance.subagentType,
        note: guidance.note,
        shapingNotes: guidance.shapingNotes,
      }
    },
    checkPreconditions({ context, toolName, toolInput }) {
      if (!config.preconditions || config.preconditions.length === 0) {
        return undefined
      }

      const totalRetries = Object.values(
        context.sessionState.toolFailureCounts,
      ).reduce((sum, count) => sum + count, 0)
      const matchingFailure = context.sessionState.recentFailures.find(
        record =>
          record.toolName === toolName &&
          record.signature === `${toolName}:${JSON.stringify(toolInput)}`,
      )

      for (const precondition of config.preconditions) {
        if (
          precondition.toolNames &&
          !precondition.toolNames.includes(toolName)
        ) {
          continue
        }
        if (
          typeof precondition.minRetryPressure === 'number' &&
          totalRetries < precondition.minRetryPressure
        ) {
          continue
        }
        if (
          typeof precondition.repeatedFailureCountAtLeast === 'number' &&
          (matchingFailure?.count ?? 0) < precondition.repeatedFailureCountAtLeast
        ) {
          continue
        }
        if (
          precondition.requireActiveTeam === true &&
          !context.sessionState.activeTeamName
        ) {
          continue
        }
        if (
          precondition.requireActiveWorktree === true &&
          !context.sessionState.activeWorktreePath
        ) {
          continue
        }

        return {
          blocked: precondition.block !== false,
          reason: precondition.reason,
          notes: precondition.notes,
        }
      }

      return undefined
    },
  }
}

export function getHello2ccStrategies(): readonly Hello2ccStrategy[] {
  ensureHello2ccStrategiesInitialized()
  return [...strategyRegistry].sort(
    (left, right) => (right.priority ?? 0) - (left.priority ?? 0),
  )
}

export function resetHello2ccStrategiesForTests(): void {
  strategyRegistry.length = 0
  defaultStrategiesInitialized = false
}

export function ensureHello2ccStrategiesInitialized(): void {
  if (defaultStrategiesInitialized) {
    return
  }
  for (const strategy of defaultHello2ccStrategies) {
    registerHello2ccStrategy(strategy)
  }
  defaultStrategiesInitialized = true
}

export function createHello2ccStrategyContext(
  sessionState: Hello2ccSessionState,
): Hello2ccStrategyContext {
  return {
    sessionState,
    strategyProfile: sessionState.capabilities.strategyProfile ?? 'balanced',
    qualityGateMode: sessionState.capabilities.qualityGateMode ?? 'advisory',
    providerPoliciesEnabled:
      sessionState.capabilities.providerPoliciesEnabled ?? true,
    sessionId: sessionState.sessionId,
    cwd: sessionState.capabilities.cwd,
    provider: sessionState.capabilities.provider,
    model: sessionState.capabilities.model,
  }
}

function matchesScope(
  scope: Hello2ccStrategyScope | undefined,
  context: Hello2ccStrategyContext,
): boolean {
  if (!scope) {
    return true
  }

  if (scope.sessionIds && !scope.sessionIds.includes(context.sessionId)) {
    return false
  }

  if (
    scope.cwdPrefixes &&
    !scope.cwdPrefixes.some(prefix => context.cwd.startsWith(prefix))
  ) {
    return false
  }

  if (
    scope.providers &&
    (!context.provider || !scope.providers.includes(context.provider))
  ) {
    return false
  }

  if (scope.modelPatterns) {
    const model = context.model?.toLowerCase()
    if (
      !model ||
      !scope.modelPatterns.some(pattern => model.includes(pattern.toLowerCase()))
    ) {
      return false
    }
  }

  if (
    scope.strategyProfiles &&
    !scope.strategyProfiles.includes(context.strategyProfile)
  ) {
    return false
  }

  if (
    scope.qualityGateModes &&
    !scope.qualityGateModes.includes(context.qualityGateMode)
  ) {
    return false
  }

  return true
}

export function getApplicableHello2ccStrategies(
  sessionState: Hello2ccSessionState,
): {
  context: Hello2ccStrategyContext
  strategies: Hello2ccStrategy[]
} {
  const context = createHello2ccStrategyContext(sessionState)
  const strategies = getHello2ccStrategies().filter(
    strategy => matchesScope(strategy.scope, context) && (strategy.when?.(context) ?? true),
  )
  return {
    context,
    strategies,
  }
}
