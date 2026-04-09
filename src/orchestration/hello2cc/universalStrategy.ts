import type {
  Hello2ccIntentProfile,
  Hello2ccRole,
  Hello2ccSessionState,
  UniversalGuidance,
  ExecutionPlaybook,
  RecoveryPlaybook,
  OutputContract,
} from './types.js'
import { getFileEditRecoveryAdvice } from './fileEditProtection.js'

function resolveRole(
  intent: Hello2ccIntentProfile,
  state: Hello2ccSessionState,
  profile: 'balanced' | 'strict',
): Hello2ccRole {
  const s = intent.signals

  if (s.needTeam && state.activeTeamName) {
    return 'team_lead'
  }
  if (s.plan) return 'planner'
  if (s.review) return 'reviewer'
  if (s.research || s.explore) return 'researcher'
  if (s.implement || s.boundedImplementation) return 'direct_executor'
  if (s.verify) return 'direct_executor'
  return 'general_operator'
}

function buildDecisionBackbone(
  intent: Hello2ccIntentProfile,
  state: Hello2ccSessionState,
  profile: 'balanced' | 'strict',
): string[] {
  const lines: string[] = []
  const s = intent.signals
  const totalRetries = Object.values(state.toolFailureCounts).reduce((sum, c) => sum + c, 0)

  if (state.activeTeamName && (s.needTeam || s.implement || s.verify)) {
    lines.push(
      `Active team "${state.activeTeamName}" exists — prefer SendMessage or team reuse before creating another worker.`,
    )
  }
  if (state.activeWorktreePath && s.needWorktree) {
    lines.push(
      `Active worktree "${state.activeWorktreePath}" exists — reuse it unless a fresh isolated branch is explicitly requested.`,
    )
  }
  if (totalRetries >= 3) {
    lines.push(
      `Retry pressure is high (${totalRetries} total retries) — prefer diagnosis or verification before another implementation hop.`,
    )
  }
  if (state.capabilities.mcpNeedsAuthCount > 0) {
    lines.push(
      `${state.capabilities.mcpNeedsAuthCount} MCP server(s) need auth — avoid MCP-dependent routes until ready.`,
    )
  }
  if (state.capabilities.mcpFailedCount > 0) {
    lines.push(
      `${state.capabilities.mcpFailedCount} MCP server(s) failed — treat MCP-backed routes as unavailable.`,
    )
  }
  if (!state.capabilities.toolSearchOptimistic) {
    lines.push(
      'Tool search confidence is low — use explicit tool names rather than deferred discovery.',
    )
  }

  // Provider/model-aware routing
  const provider = state.capabilities.provider
  const model = state.capabilities.model
  if (provider && provider !== 'firstParty') {
    lines.push(
      `provider=${provider} is active, so keep tool routing explicit and avoid relying on first-party-only surfaces.`,
    )
  }
  if (model && isNonStandardModel(model)) {
    const modelHint = getModelFamilyHint(model)
    if (modelHint) lines.push(modelHint)
  }
  if (profile === 'strict') {
    lines.push('Strict strategy profile is active — fail closed on repeated tool retries and prefer verification.')
  }

  const fileEditAdvice = getFileEditRecoveryAdvice(state)
  if (fileEditAdvice.length > 0) {
    lines.push(...fileEditAdvice)
  }

  if (lines.length === 0) {
    lines.push(
      `Prefer the shortest path that matches the current intent (${intent.primaryIntent}) using surfaced host capabilities.`,
    )
  }

  return lines.slice(0, 6)
}

function buildExecutionPlaybook(
  intent: Hello2ccIntentProfile,
  state: Hello2ccSessionState,
): ExecutionPlaybook {
  const s = intent.signals

  switch (intent.primaryIntent) {
    case 'implement':
      return {
        orderedSteps: [
          'identify the narrowest change scope',
          'read relevant files before editing',
          'apply surgical edits',
          'validate the change',
        ],
        primaryTools: s.needTeam && state.activeTeamName
          ? ['SendMessage', 'Agent']
          : ['Agent', 'Edit', 'Write', 'FileRead'],
        avoidShortcuts: [
          'editing without reading first',
          'creating parallel workers for narrow changes',
        ],
      }
    case 'review':
      return {
        orderedSteps: [
          'inspect the changed files or diffs',
          'identify findings by severity',
          'highlight regression risks',
          'summarize at the end',
        ],
        primaryTools: ['FileRead', 'Grep', 'Bash'],
        avoidShortcuts: [
          'generating code before completing review',
          'hiding critical findings in prose',
        ],
      }
    case 'verify':
      return {
        orderedSteps: [
          'identify what needs validation',
          'run or describe the verification path',
          'report pass/fail with evidence',
          'state explicitly what was not run',
        ],
        primaryTools: ['Bash', 'Agent'],
        avoidShortcuts: [
          'claiming success without evidence',
          'skipping verification on non-trivial changes',
        ],
      }
    case 'plan':
      return {
        orderedSteps: [
          'gather constraints and requirements',
          'identify blocking questions',
          'emit an executable plan with phases',
          'submit for approval if needed',
        ],
        primaryTools: ['AskUserQuestion'],
        avoidShortcuts: [
          'implementation before the plan is clear',
          'asking non-blocking questions',
        ],
      }
    case 'explore':
    case 'research':
      return {
        orderedSteps: [
          'search for relevant surfaces',
          'read targeted context',
          'summarize paths and unknowns',
        ],
        primaryTools: ['FileRead', 'Grep', 'Glob', 'Agent'],
        avoidShortcuts: [
          'broad repository drift',
          'drawing conclusions without evidence',
        ],
      }
    case 'compare':
      return {
        orderedSteps: [
          'identify the options being compared',
          'evaluate trade-offs for each',
          'give a recommendation with适用 boundary',
        ],
        primaryTools: [],
        avoidShortcuts: [
          'listing options without analysis',
          'making a recommendation without trade-offs',
        ],
      }
    default:
      return {
        orderedSteps: ['inspect relevant context', 'apply changes', 'report status'],
        primaryTools: ['Agent', 'FileRead'],
        avoidShortcuts: ['claiming done without validation'],
      }
  }
}

function buildRecoveryPlaybook(state: Hello2ccSessionState): RecoveryPlaybook {
  const guards: Array<{ trigger: string; recipe: string }> = []

  const topFailure = Object.entries(state.toolFailureCounts)
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])[0]

  if (topFailure && topFailure[1] >= 2) {
    guards.push({
      trigger: `${topFailure[0]} failed ${topFailure[1]} times`,
      recipe: `Switch to diagnosis: read the error, check preconditions, and try a different approach before retrying ${topFailure[0]}.`,
    })
  }

  if (state.recentFailures.some(f => f.count >= 2)) {
    for (const failure of state.recentFailures.filter(f => f.count >= 2)) {
      guards.push({
        trigger: `${failure.toolName} repeated failure: ${failure.summary}`,
        recipe: `Do not retry ${failure.toolName} with the same input. Change preconditions or use a different tool.`,
      })
    }
  }

  const fileEditAdvice = getFileEditRecoveryAdvice(state)
  if (fileEditAdvice.length > 0) {
    guards.push({
      trigger: 'File edit failures detected',
      recipe: fileEditAdvice.join(' '),
    })
  }

  if (state.capabilities.mcpFailedCount > 0) {
    guards.push({
      trigger: `${state.capabilities.mcpFailedCount} MCP server(s) failed`,
      recipe: 'Avoid MCP-dependent routes until the failure is cleared, or choose a non-MCP path.',
    })
  }

  return { guards }
}

function buildOutputContract(intent: Hello2ccIntentProfile): OutputContract {
  switch (intent.primaryIntent) {
    case 'review':
      return {
        openingStyle: 'findings_first',
        sectionOrder: ['severity_overview', 'findings_by_risk', 'change_summary'],
        tableMode: 'compact_markdown',
      }
    case 'verify':
      return {
        openingStyle: 'status_first',
        sectionOrder: ['pass_fail_status', 'evidence', 'gaps'],
      }
    case 'compare':
      return {
        openingStyle: 'judgment_first',
        sectionOrder: ['one_sentence_judgment', 'comparison_table', 'recommendation'],
        tableMode: 'compact_markdown',
      }
    case 'plan':
      return {
        openingStyle: 'constraints_first',
        sectionOrder: ['constraints', 'phases', 'open_questions'],
      }
    case 'explore':
    case 'research':
      return {
        openingStyle: 'direct_findings',
        sectionOrder: ['findings', 'paths_explored', 'unknowns'],
      }
    default:
      return {
        openingStyle: 'direct',
        sectionOrder: ['answer', 'details'],
      }
  }
}

function buildTieBreakers(
  intent: Hello2ccIntentProfile,
  state: Hello2ccSessionState,
): string[] {
  const tieBreakers: string[] = []
  const s = intent.signals

  if (state.activeTeamName && s.needTeam) {
    tieBreakers.push('Reuse existing team > Create new team')
  }
  if (state.activeWorktreePath && s.needWorktree) {
    tieBreakers.push('Reuse existing worktree > Create new worktree')
  }
  if (state.capabilities.supportsMessaging) {
    tieBreakers.push('SendMessage to existing worker > Spawn new Agent')
  }
  if (state.capabilities.supportsAgent && s.implement) {
    tieBreakers.push('Bounded Agent > Bash for code changes')
  }
  if (Object.values(state.toolFailureCounts).reduce((sum, c) => sum + c, 0) >= 2) {
    tieBreakers.push('Diagnosis/verification > Speculative retry')
  }

  return tieBreakers
}

function isNonStandardModel(model: string): boolean {
  const lower = model.toLowerCase()
  return (
    lower.includes('qwen') ||
    lower.includes('deepseek') ||
    lower.includes('gpt') ||
    lower.includes('claude') === false
  )
}

function getModelFamilyHint(model: string): string | null {
  const lower = model.toLowerCase()
  if (lower.includes('qwen')) {
    return `model=${model} — Qwen-family models usually respond better with host-visible structure and explicit section headers.`
  }
  if (lower.includes('deepseek')) {
    return `model=${model} — DeepSeek-family models benefit from explicit reasoning boundaries and concrete output contracts.`
  }
  if (lower.includes('gpt')) {
    return `model=${model} — GPT-family models tend to benefit from explicit execution framing and tighter output contracts.`
  }
  return null
}

export function buildUniversalGuidance(
  state: Hello2ccSessionState,
  intent: Hello2ccIntentProfile,
): UniversalGuidance {
  const profile = state.capabilities.profile ?? 'balanced'

  return {
    role: resolveRole(intent, state, profile),
    specialization: intent.primaryIntent,
    decisionBackbone: buildDecisionBackbone(intent, state, profile),
    executionPlaybook: buildExecutionPlaybook(intent, state),
    recoveryPlaybook: buildRecoveryPlaybook(state),
    outputContract: buildOutputContract(intent),
    tieBreakers: buildTieBreakers(intent, state),
  }
}

export function formatGuidanceForSystemContext(guidance: UniversalGuidance): string {
  const lines = [
    '# Gateway Orchestration Guidance',
    '',
    `Role: ${guidance.role}`,
    `Specialization: ${guidance.specialization}`,
    '',
    '## Decision Backbone',
    ...guidance.decisionBackbone.map((line, i) => `${i + 1}. ${line}`),
    '',
    '## Execution Playbook',
    `Steps: ${guidance.executionPlaybook.orderedSteps.join(' -> ')}`,
    `Primary tools: ${guidance.executionPlaybook.primaryTools.join(', ') || 'context-dependent'}`,
    `Avoid: ${guidance.executionPlaybook.avoidShortcuts.join('; ')}`,
    '',
    '## Output Contract',
    `Opening: ${guidance.outputContract.openingStyle}`,
    `Sections: ${guidance.outputContract.sectionOrder.join(' -> ')}`,
    ...(guidance.outputContract.tableMode ? [`Table: ${guidance.outputContract.tableMode}`] : []),
  ]

  if (guidance.recoveryPlaybook.guards.length > 0) {
    lines.push(
      '',
      '## Recovery Guards',
      ...guidance.recoveryPlaybook.guards.map(g => `- ${g.trigger}: ${g.recipe}`),
    )
  }

  if (guidance.tieBreakers.length > 0) {
    lines.push(
      '',
      '## Tie-Breakers (when multiple paths are viable)',
      ...guidance.tieBreakers.map((tb, i) => `${i + 1}. ${tb}`),
    )
  }

  return lines.join('\n')
}

export function formatGuidanceAsJsonSnapshot(guidance: UniversalGuidance): string {
  return JSON.stringify(
    {
      role: guidance.role,
      specialization: guidance.specialization,
      decision_backbone: guidance.decisionBackbone,
      execution_playbook: guidance.executionPlaybook,
      recovery_playbook: guidance.recoveryPlaybook,
      output_contract: guidance.outputContract,
      tie_breakers: guidance.tieBreakers,
    },
    null,
    2,
  )
}
