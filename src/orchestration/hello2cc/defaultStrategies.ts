import type { Hello2ccStrategy } from './strategy.js'

function hasSubagentType(
  availableSubagentTypes: string[],
  candidate: 'Explore' | 'Plan',
): boolean {
  return availableSubagentTypes.some(
    agentType => agentType.toLowerCase() === candidate.toLowerCase(),
  )
}

export const capabilityPolicyStrategy: Hello2ccStrategy = {
  id: 'capability-policy',
  priority: 50,
  buildSessionStartLines({ context }) {
    const capabilities = context.sessionState.capabilities
    return [
      capabilities.availableSubagentTypes.length > 0
        ? `- available subagent types: ${capabilities.availableSubagentTypes.join(', ')}`
        : undefined,
      `- MCP posture: connected=${capabilities.mcpConnectedCount}, auth=${capabilities.mcpNeedsAuthCount}, pending=${capabilities.mcpPendingCount}, failed=${capabilities.mcpFailedCount}`,
      `- search posture: tool search optimistic=${capabilities.toolSearchOptimistic ? 'yes' : 'no'}, web search available=${capabilities.webSearchAvailable ? 'yes' : 'no'}, web requests seen=${capabilities.webSearchRequests}`,
    ].filter(Boolean) as string[]
  },
  buildRouteRecommendations({ context }) {
    const capabilities = context.sessionState.capabilities
    const recommendations: string[] = []
    if (capabilities.availableSubagentTypes.length > 0) {
      recommendations.push(
        `available subagent specializations: ${capabilities.availableSubagentTypes.join(', ')}`,
      )
    }
    if (capabilities.mcpNeedsAuthCount > 0) {
      recommendations.push(
        `${capabilities.mcpNeedsAuthCount} MCP server(s) still need auth, so avoid routes that depend on them until they are ready`,
      )
    }
    if (capabilities.mcpPendingCount > 0) {
      recommendations.push(
        `${capabilities.mcpPendingCount} MCP server(s) are still pending, so prefer stable local tools first`,
      )
    }
    if (!capabilities.toolSearchOptimistic) {
      recommendations.push(
        'tool search is not confidently available, so prefer directly invoking known tools instead of relying on deferred discovery',
      )
    }
    if (capabilities.webSearchAvailable && capabilities.webSearchRequests > 0) {
      recommendations.push(
        `web search has already been used ${capabilities.webSearchRequests} time(s) this session, so reuse grounded external context before repeating searches`,
      )
    }
    return recommendations
  },
}

export const conservativeSubagentStrategy: Hello2ccStrategy = {
  id: 'conservative-subagent',
  priority: 40,
  suggestSubagentGuidance({ context, toolName, toolInput }) {
    if (toolName !== 'Agent') {
      return undefined
    }

    const requestedType =
      typeof toolInput.subagent_type === 'string'
        ? toolInput.subagent_type.trim()
        : undefined
    const availableTypes = context.sessionState.capabilities.availableSubagentTypes
    const intent = context.sessionState.lastIntent?.primaryIntent
    const signals = context.sessionState.lastIntent?.signals
    const isPlanningLike = intent === 'plan' || signals?.plan === true
    const isInvestigationLike =
      intent === 'explore' ||
      intent === 'review' ||
      intent === 'verify' ||
      signals?.explore === true ||
      signals?.review === true ||
      signals?.verify === true

    const shapingNotes: string[] = []
    if (availableTypes.length > 0) {
      shapingNotes.push(
        `Available subagent types in this host: ${availableTypes.join(', ')}.`,
      )
    }

    if (requestedType) {
      shapingNotes.push(
        `Agent.subagent_type is already set to ${requestedType}, so hello2cc will preserve the caller's explicit routing choice.`,
      )
      return { shapingNotes }
    }

    if (isPlanningLike && hasSubagentType(availableTypes, 'Plan')) {
      return {
        subagentType: 'Plan',
        note: 'Selected the Plan subagent because the active request is planning-oriented and benefits from a read-only design pass.',
        shapingNotes,
      }
    }

    if (isInvestigationLike && hasSubagentType(availableTypes, 'Explore')) {
      return {
        subagentType: 'Explore',
        note: 'Selected the Explore subagent because the active request is investigation-oriented and benefits from read-only code search.',
        shapingNotes,
      }
    }

    if (isPlanningLike) {
      shapingNotes.push(
        'The request is planning-oriented, so keep the Agent prompt read-only and focused on architecture, rollout, or boundary decisions.',
      )
    }

    if (isInvestigationLike) {
      shapingNotes.push(
        'The request is investigation-oriented, so keep the Agent prompt read-only and ask for findings, evidence, or verification instead of edits.',
      )
    }

    if (intent === 'implement' && context.sessionState.activeTeamName) {
      shapingNotes.push(
        `An active team (${context.sessionState.activeTeamName}) already exists, so consider SendMessage before spawning another general worker.`,
      )
    }

    return { shapingNotes }
  },
}

export const providerAwarePolicyStrategy: Hello2ccStrategy = {
  id: 'provider-aware-policy',
  priority: 60,
  when(context) {
    return context.providerPoliciesEnabled
  },
  buildRouteRecommendations({ context }) {
    const recommendations: string[] = []
    const provider = context.provider
    const model = context.model?.toLowerCase()

    if (provider && provider !== 'firstParty') {
      recommendations.push(
        `provider=${provider} is active, so keep tool routing explicit and lean on host facts instead of assuming first-party tool semantics`,
      )
    }

    if (provider === 'firstParty' && !context.sessionState.capabilities.toolSearchOptimistic) {
      recommendations.push(
        'the current first-party provider path still lacks confident tool-search support, so avoid depending on deferred tool discovery until the proxy path is confirmed',
      )
    }

    if (model?.includes('gpt') || model?.includes('qwen') || model?.includes('deepseek')) {
      recommendations.push(
        `model=${context.model} may need more explicit host scaffolding, so prefer concrete tool names, explicit summaries, and shorter routing hops`,
      )
    }

    return recommendations
  },
}

export const gptModelFamilyStrategy: Hello2ccStrategy = {
  id: 'model-family-gpt',
  priority: 70,
  scope: {
    modelPatterns: ['gpt'],
  },
  when(context) {
    return context.providerPoliciesEnabled
  },
  buildRouteRecommendations() {
    return [
      'GPT-family models tend to benefit from explicit execution framing, so prefer short task descriptions, concrete tool names, and explicit success criteria.',
    ]
  },
  suggestSubagentGuidance({ context, toolName }) {
    if (toolName !== 'Agent') {
      return undefined
    }
    if (context.sessionState.lastIntent?.primaryIntent === 'implement') {
      return {
        shapingNotes: [
          'For GPT-family models, keep Agent prompts narrowly scoped and include the exact expected artifact or validation target.',
        ],
      }
    }
    return undefined
  },
}

export const qwenModelFamilyStrategy: Hello2ccStrategy = {
  id: 'model-family-qwen',
  priority: 70,
  scope: {
    modelPatterns: ['qwen'],
  },
  when(context) {
    return context.providerPoliciesEnabled
  },
  buildRouteRecommendations() {
    return [
      'Qwen-family models usually respond better to host-visible structure, so preserve route summaries, reuse active workers, and avoid ambiguous multi-hop delegation.',
    ]
  },
}

export const deepseekModelFamilyStrategy: Hello2ccStrategy = {
  id: 'model-family-deepseek',
  priority: 70,
  scope: {
    modelPatterns: ['deepseek'],
  },
  when(context) {
    return context.providerPoliciesEnabled
  },
  buildRouteRecommendations({ context }) {
    const recommendations = [
      'DeepSeek-family models benefit from explicit reasoning boundaries, so separate planning, implementation, and verification steps instead of mixing them in one worker prompt.',
    ]
    if (context.strategyProfile === 'strict') {
      recommendations.push(
        'Strict strategy profile is active, so keep DeepSeek-family execution especially phase-oriented and verify before re-entering implementation.',
      )
    }
    return recommendations
  },
}

export const longTaskOrchestratorPolicyStrategy: Hello2ccStrategy = {
  id: 'long-task-orchestrator-policy',
  priority: 30,
  buildRouteRecommendations({ context, intentProfile }) {
    const recommendations: string[] = []
    const sessionState = context.sessionState
    const totalRetries = Object.values(sessionState.toolFailureCounts).reduce(
      (sum, count) => sum + count,
      0,
    )

    if (
      sessionState.activeTeamName &&
      (intentProfile.signals.needTeam ||
        intentProfile.primaryIntent === 'implement' ||
        intentProfile.primaryIntent === 'verify')
    ) {
      recommendations.push(
        `an active team (${sessionState.activeTeamName}) already exists, so prefer SendMessage or team reuse before creating another parallel worker set`,
      )
    }

    if (sessionState.activeWorktreePath && intentProfile.signals.needWorktree) {
      recommendations.push(
        `an active worktree (${sessionState.activeWorktreePath}) already exists, so reuse it unless the user explicitly asks for a fresh isolated branch`,
      )
    }

    if (totalRetries >= 3) {
      recommendations.push(
        `session retry pressure is elevated (${totalRetries} total retries), so prefer diagnosis, verification, or a changed execution plan instead of repeating the same failing path`,
      )
    }

    return recommendations
  },
  checkPreconditions({ context, toolName, toolInput }) {
    if (context.qualityGateMode === 'off') {
      return undefined
    }

    const sessionState = context.sessionState
    const totalRetries = Object.values(sessionState.toolFailureCounts).reduce(
      (sum, count) => sum + count,
      0,
    )
    const notes: string[] = []

    if (
      toolName === 'TeamCreate' &&
      sessionState.activeTeamName &&
      context.qualityGateMode === 'strict'
    ) {
      return {
        blocked: true,
        reason: `Quality gate blocked TeamCreate because an active team (${sessionState.activeTeamName}) already exists. Reuse it unless a new parallel group is explicitly required.`,
        notes: [
          'Strict quality gate blocked duplicate parallel team creation during a long-running session.',
        ],
      }
    }

    if (
      toolName === 'Agent' &&
      totalRetries >= 3 &&
      context.qualityGateMode === 'strict'
    ) {
      const prompt =
        typeof toolInput.prompt === 'string' ? toolInput.prompt.toLowerCase() : ''
      const mentionsDiagnosis =
        prompt.includes('verify') ||
        prompt.includes('diagnose') ||
        prompt.includes('investigate') ||
        prompt.includes('review')

      if (!mentionsDiagnosis) {
        return {
          blocked: true,
          reason:
            'Quality gate blocked another implementation-oriented Agent run because retry pressure is already high. Run diagnosis or verification first, then retry with changed preconditions.',
          notes: [
            'Strict quality gate requires a diagnosis or verification step before repeating an implementation path after repeated failures.',
          ],
        }
      }
    }

    if (totalRetries >= 2 && context.qualityGateMode === 'advisory') {
      notes.push(
        `Advisory quality gate: this session has ${totalRetries} total retries, so prefer diagnosis or verification before another speculative retry.`,
      )
    }

    return notes.length > 0 ? { notes } : undefined
  },
}

export const defaultHello2ccStrategies = [
  gptModelFamilyStrategy,
  qwenModelFamilyStrategy,
  deepseekModelFamilyStrategy,
  providerAwarePolicyStrategy,
  capabilityPolicyStrategy,
  conservativeSubagentStrategy,
  longTaskOrchestratorPolicyStrategy,
] as const
