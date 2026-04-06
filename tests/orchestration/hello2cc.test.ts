import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { getSessionId, getOriginalCwd, setOriginalCwd } from '../../src/bootstrap/state.ts'
import hello2ccCommand from '../../src/commands/hello2cc/index.ts'
import { call as hello2ccCommandCall } from '../../src/commands/hello2cc/hello2cc.ts'
import hello2ccInitCommand from '../../src/commands/hello2cc-init/index.ts'
import { call as hello2ccInitCall } from '../../src/commands/hello2cc-init/hello2cc-init.ts'
import { analyzeIntentProfile } from '../../src/orchestration/hello2cc/intentProfile.ts'
import { checkToolPreconditions } from '../../src/orchestration/hello2cc/preconditions.ts'
import {
  buildRouteGuidance,
  buildSessionStartContext,
} from '../../src/orchestration/hello2cc/routeGuidance.ts'
import {
  getGatewayOrchestrationState,
  registerHello2ccStrategy,
  restoreHello2ccSessionState as restoreGatewayOrchestrationState,
} from '../../src/orchestration/hello2cc/index.ts'
import {
  buildHello2ccHealthSummary,
  buildHello2ccResumeSummary,
} from '../../src/orchestration/hello2cc/summary.ts'
import {
  clearHello2ccSessionState,
  getHello2ccSessionState,
  restoreHello2ccSessionState,
  snapshotHello2ccSessionState,
} from '../../src/orchestration/hello2cc/sessionState.ts'
import {
  createHello2ccStrategyFromConfig,
  resetHello2ccStrategiesForTests,
} from '../../src/orchestration/hello2cc/strategy.ts'
import { normalizeToolInput } from '../../src/orchestration/hello2cc/toolNormalization.ts'
import type { Hello2ccSessionState } from '../../src/orchestration/hello2cc/types.ts'
import {
  buildRecommendedHello2ccProjectSettings,
  getHello2ccProjectPresetPath,
  getHello2ccUserPresetPath,
  getInitialSettings,
} from '../../src/utils/settings/settings.ts'
import { resetSettingsCache } from '../../src/utils/settings/settingsCache.ts'

function makeSessionState(): Hello2ccSessionState {
  return {
    sessionId: 'session-1',
    capabilities: {
      cwd: '/repo',
      toolNames: ['Agent', 'SendMessage', 'TeamCreate', 'EnterWorktree'],
      supportsAgent: true,
      supportsTeam: true,
      supportsMessaging: true,
      supportsWorktree: true,
      availableSubagentTypes: ['Plan', 'Explore', 'GeneralPurpose'],
      mcpConnectedCount: 2,
      mcpPendingCount: 1,
      mcpNeedsAuthCount: 1,
      mcpFailedCount: 0,
      toolSearchOptimistic: false,
      webSearchAvailable: true,
      webSearchRequests: 2,
      provider: 'firstParty',
      strategyProfile: 'balanced',
      qualityGateMode: 'advisory',
      providerPoliciesEnabled: true,
      model: 'gateway-main',
    },
    toolFailureCounts: {},
    recentSuccesses: [],
    recentFailures: [],
  }
}

describe('hello2cc orchestration', () => {
  const originalCwd = getOriginalCwd()
  const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR

  beforeEach(() => {
    resetHello2ccStrategiesForTests()
    resetSettingsCache()
    setOriginalCwd(originalCwd)
    if (originalClaudeConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir
    }
  })

  afterEach(() => {
    resetSettingsCache()
    setOriginalCwd(originalCwd)
    if (originalClaudeConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir
    }
  })

  test('analyzes implementation intent and explicit worktree need', () => {
    const profile = analyzeIntentProfile('请在独立 worktree 中实现 Gateway 编排增强层')

    expect(profile.primaryIntent).toBe('implement')
    expect(profile.signals.needWorktree).toBe(true)
    expect(profile.signals.externalSystem).toBe(true)
  })

  test('builds route guidance with capability-aware recommendations', () => {
    const state = makeSessionState()
    state.activeTeamName = 'gateway-workers'
    const profile = analyzeIntentProfile('Use gitworker to parallel implementation work')
    const guidance = buildRouteGuidance(state, profile)

    expect(guidance).toContain('detected intent: implement')
    expect(guidance).toContain('TeamCreate is available')
    expect(guidance).toContain('SendMessage can continue an existing worker')
    expect(guidance).toContain('available subagent specializations: Plan, Explore, GeneralPurpose')
    expect(guidance).toContain('tool search is not confidently available')
    expect(guidance).toContain('prefer SendMessage or team reuse before creating another parallel worker set')
  })

  test('accepts custom route strategies without changing the main orchestration entrypoints', () => {
    registerHello2ccStrategy({
      id: 'test-custom-route',
      buildRouteRecommendations() {
        return ['custom policy: prefer the test route first']
      },
    })

    const state = makeSessionState()
    const profile = analyzeIntentProfile('Please plan the next Gateway step')
    const guidance = buildRouteGuidance(state, profile)

    expect(guidance).toContain('custom policy: prefer the test route first')
  })

  test('applies provider-aware recommendations when non-first-party providers are active', () => {
    const state = makeSessionState()
    state.capabilities.provider = 'bedrock'
    state.capabilities.model = 'gpt-4o-proxy'

    const guidance = buildRouteGuidance(
      state,
      analyzeIntentProfile('Please continue this Gateway implementation'),
    )

    expect(guidance).toContain(
      'provider=bedrock is active, so keep tool routing explicit',
    )
    expect(guidance).toContain(
      'model=gpt-4o-proxy may need more explicit host scaffolding',
    )
    expect(guidance).toContain(
      'GPT-family models tend to benefit from explicit execution framing',
    )
  })

  test('applies model-family strategies for qwen and deepseek models', () => {
    const qwenState = makeSessionState()
    qwenState.capabilities.model = 'qwen-max'
    const qwenGuidance = buildRouteGuidance(
      qwenState,
      analyzeIntentProfile('继续这个 Gateway 长任务'),
    )
    expect(qwenGuidance).toContain(
      'Qwen-family models usually respond better to host-visible structure',
    )

    const deepseekState = makeSessionState()
    deepseekState.capabilities.model = 'deepseek-r1'
    deepseekState.capabilities.strategyProfile = 'strict'
    const deepseekGuidance = buildRouteGuidance(
      deepseekState,
      analyzeIntentProfile('继续这个 Gateway 长任务'),
    )
    expect(deepseekGuidance).toContain(
      'DeepSeek-family models benefit from explicit reasoning boundaries',
    )
    expect(deepseekGuidance).toContain(
      'Strict strategy profile is active',
    )
  })

  test('normalizes Agent input and fills missing description', () => {
    const state = makeSessionState()
    state.lastIntent = analyzeIntentProfile('请在独立 worktree 中实现这个功能')

    const result = normalizeToolInput(
      'Agent',
      {
        description: '   ',
        prompt: '  Implement the orchestration enhancement in an isolated worktree  ',
      },
      state,
    )

    expect(result.updatedInput?.description).toContain('Implement the orchestration enhancement')
    expect(result.updatedInput?.isolation).toBe('worktree')
    expect(result.notes.length).toBeGreaterThan(0)
  })

  test('routes planning-oriented Agent calls to the Plan subagent when safe', () => {
    const state = makeSessionState()
    state.lastIntent = analyzeIntentProfile('请先规划一下这个 Gateway 编排方案')

    const result = normalizeToolInput(
      'Agent',
      {
        description: 'plan the approach',
        prompt: 'Design the architecture and rollout plan for this Gateway change',
      },
      state,
    )

    expect(result.updatedInput?.subagent_type).toBe('Plan')
    expect(result.notes.join(' ')).toContain('Plan subagent')
    expect(result.notes.join(' ')).toContain(
      'Available subagent types in this host: Plan, Explore, GeneralPurpose.',
    )
  })

  test('keeps investigation-oriented Agent prompts read-only when Explore is unavailable', () => {
    const state = makeSessionState()
    state.capabilities.availableSubagentTypes = ['Plan', 'GeneralPurpose']
    state.lastIntent = analyzeIntentProfile('请先 review 一下这个 Gateway 实现风险')

    const result = normalizeToolInput(
      'Agent',
      {
        description: 'review gateway changes',
        prompt: 'Inspect the Gateway orchestration change and list risks',
      },
      state,
    )

    expect(result.updatedInput?.subagent_type).toBeUndefined()
    expect(result.notes.join(' ')).toContain('keep the Agent prompt read-only')
  })

  test('normalizes SendMessage summary from the message body', () => {
    const state = makeSessionState()
    const result = normalizeToolInput(
      'SendMessage',
      {
        to: 'worker-1',
        message: 'Please continue the Gateway orchestration implementation and report touched files.',
      },
      state,
    )

    expect(result.updatedInput?.summary).toContain('Please continue the Gateway orchestration')
  })

  test('blocks deterministic duplicate worktree creation and repeated retries', () => {
    const state = makeSessionState()
    state.activeWorktreePath = '/tmp/existing-worktree'
    state.recentFailures.push({
      toolName: 'Agent',
      signature:
        'Agent:{"description":"worker","prompt":"retry the same failing path"}',
      summary: 'missing worktree isolation',
      count: 2,
      updatedAt: '2026-04-06T10:05:00.000Z',
    })

    const worktreeCheck = checkToolPreconditions(
      'EnterWorktree',
      { name: 'feature-x' },
      state,
    )
    const retryCheck = checkToolPreconditions(
      'Agent',
      {
        description: 'worker',
        prompt: 'retry the same failing path',
      },
      state,
    )

    expect(worktreeCheck.blocked).toBe(true)
    expect(worktreeCheck.reason).toContain('/tmp/existing-worktree')
    expect(retryCheck.blocked).toBe(true)
    expect(retryCheck.reason).toContain('failed 2 times recently')
  })

  test('strict quality gate blocks another implementation worker after repeated failures', () => {
    const state = makeSessionState()
    state.capabilities.qualityGateMode = 'strict'
    state.toolFailureCounts.Agent = 3

    const result = checkToolPreconditions(
      'Agent',
      {
        description: 'worker',
        prompt: 'Implement the same Gateway change again',
      },
      state,
    )

    expect(result.blocked).toBe(true)
    expect(result.reason).toContain('Quality gate blocked another implementation-oriented Agent run')
  })

  test('strategy predicates and priority affect routing contributions in order', () => {
    registerHello2ccStrategy({
      id: 'test-low',
      priority: 10,
      buildRouteRecommendations() {
        return ['priority-low']
      },
    })
    registerHello2ccStrategy({
      id: 'test-conditional',
      priority: 100,
      when(context) {
        return context.provider === 'vertex'
      },
      buildRouteRecommendations() {
        return ['priority-conditional']
      },
    })

    const state = makeSessionState()
    state.capabilities.provider = 'vertex'
    const guidance = buildRouteGuidance(
      state,
      analyzeIntentProfile('Plan the next Gateway step'),
    )

    expect(guidance).toContain('priority-conditional')
    expect(guidance).toContain('priority-low')
    expect(guidance.indexOf('priority-conditional')).toBeLessThan(
      guidance.indexOf('priority-low'),
    )
  })

  test('strategy scope can target specific project paths and sessions', () => {
    registerHello2ccStrategy({
      id: 'project-session-scoped',
      priority: 90,
      scope: {
        sessionIds: ['session-1'],
        cwdPrefixes: ['/repo'],
        providers: ['firstParty'],
      },
      buildRouteRecommendations() {
        return ['scoped-policy-hit']
      },
    })
    registerHello2ccStrategy({
      id: 'project-session-miss',
      priority: 95,
      scope: {
        sessionIds: ['other-session'],
      },
      buildRouteRecommendations() {
        return ['scoped-policy-miss']
      },
    })

    const state = makeSessionState()
    const guidance = buildRouteGuidance(
      state,
      analyzeIntentProfile('Plan the next Gateway step'),
    )

    expect(guidance).toContain('scoped-policy-hit')
    expect(guidance).not.toContain('scoped-policy-miss')
  })

  test('creates route strategies from declarative config', () => {
    registerHello2ccStrategy(
      createHello2ccStrategyFromConfig({
        id: 'config-driven',
        priority: 88,
        scope: {
          providers: ['firstParty'],
          modelPatterns: ['gateway'],
        },
        routeRecommendations: ['config-driven-hit'],
      }),
    )

    const state = makeSessionState()
    const guidance = buildRouteGuidance(
      state,
      analyzeIntentProfile('Plan the next Gateway step'),
    )

    expect(guidance).toContain('config-driven-hit')
  })

  test('supports stronger declarative policies beyond route recommendations', async () => {
    registerHello2ccStrategy(
      createHello2ccStrategyFromConfig({
        id: 'config-policy',
        priority: 88,
        activation: {
          intents: ['plan'],
          minRetryPressure: 2,
          requireActiveTeam: true,
        },
        scope: {
          providers: ['firstParty'],
          modelPatterns: ['gateway'],
          strategyProfiles: ['balanced'],
          qualityGateModes: ['advisory'],
        },
        sessionStartLines: ['- config policy session-start'],
        routeRecommendations: ['config-policy-route'],
        subagentGuidance: {
          toolNames: ['Agent'],
          subagentType: 'Plan',
          note: 'config policy selected Plan',
          shapingNotes: ['config policy shaping note'],
        },
        preconditions: [
          {
            toolNames: ['SendMessage'],
            requireActiveTeam: true,
            block: true,
            reason: 'config policy blocked team broadcast until the plan is refreshed',
            notes: ['config policy precondition hit'],
          },
        ],
      }),
    )

    const state = makeSessionState()
    state.lastIntent = analyzeIntentProfile('请先规划一下这个 Gateway 长任务')
    state.activeTeamName = 'gateway-workers'
    state.toolFailureCounts.Agent = 2

    const sessionStart = buildSessionStartContext(state)
    const guidance = buildRouteGuidance(state, state.lastIntent)
    const normalization = normalizeToolInput(
      'Agent',
      {
        description: 'plan the next step',
        prompt: 'Design the next Gateway rollout slice',
      },
      state,
    )
    const precondition = checkToolPreconditions(
      'SendMessage',
      {
        to: '*',
        message: 'Please continue with the old plan',
      },
      state,
    )

    expect(sessionStart).toContain('config policy session-start')
    expect(guidance).toContain('config-policy-route')
    expect(normalization.updatedInput?.subagent_type).toBe('Plan')
    expect(normalization.notes.join(' ')).toContain('config policy selected Plan')
    expect(normalization.notes.join(' ')).toContain('config policy shaping note')
    expect(precondition.blocked).toBe(true)
    expect(precondition.reason).toContain('config policy blocked team broadcast')
  })

  test('exposes a dedicated /hello2cc debug command', async () => {
    const state = makeSessionState()
    state.sessionId = getSessionId()
    state.lastIntent = analyzeIntentProfile('继续这个 Gateway 长任务')
    state.activeTeamName = 'gateway-workers'
    restoreGatewayOrchestrationState(snapshotHello2ccSessionState(state))

    const result = await hello2ccCommandCall('', {} as never)
    const jsonResult = await hello2ccCommandCall('json', {} as never)
    const bothResult = await hello2ccCommandCall('both', {} as never)
    const orchestrationState = getGatewayOrchestrationState()

    expect(hello2ccCommand.name).toBe('hello2cc')
    expect(hello2ccCommand.aliases).toContain('hello2cc-debug')
    expect(result.type).toBe('text')
    expect(result.value).toContain('hello2cc diagnostic summary')
    expect(result.value).toContain('Host facts')
    expect(result.value).toContain('activeTeam=gateway-workers')
    expect(result.value).toContain('Severity')
    expect(result.value).toContain('- medium')
    expect(result.value).toContain('Detected anomalies')
    expect(result.value).toContain('active team reuse opportunity detected (gateway-workers)')
    expect(result.value).toContain('Suggested actions')
    expect(result.value).toContain('reuse SendMessage with the active team (gateway-workers)')
    expect(jsonResult.value).toContain(`"sessionId": "${state.sessionId}"`)
    expect(jsonResult.value).toContain('"activeTeamName": "gateway-workers"')
    expect(bothResult.value).toContain('Raw JSON snapshot')
    expect(bothResult.value).toContain(`"sessionId": "${state.sessionId}"`)
    expect(orchestrationState?.activeTeamName).toBe('gateway-workers')
  })

  test('auto-loads conventional hello2cc preset files without editing settings.json', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'hello2cc-settings-'))
    const configDir = join(tempRoot, 'claude-home')
    const projectDir = join(tempRoot, 'repo')

    process.env.CLAUDE_CONFIG_DIR = configDir
    setOriginalCwd(projectDir)

    const userResult = await hello2ccInitCall('user', {} as never)
    const projectResult = await hello2ccInitCall('project', {} as never)
    const effectiveSettings = getInitialSettings()

    expect(userResult.type).toBe('text')
    expect(projectResult.type).toBe('text')
    expect(effectiveSettings.hello2cc?.resumeSummaryStyle).toBe('compact')
    expect(effectiveSettings.hello2cc?.extraStrategies?.[0]?.scope?.cwdPrefixes).toContain(
      projectDir,
    )
  })

  test('generates conventional hello2cc config files for the current project', async () => {
    const tempRoot = await mkdtemp(join(tmpdir(), 'hello2cc-init-'))
    const configDir = join(tempRoot, 'claude-home')
    const projectDir = join(tempRoot, 'repo')

    process.env.CLAUDE_CONFIG_DIR = configDir
    setOriginalCwd(projectDir)

    const result = await hello2ccInitCall('both', {} as never)
    const userPath = getHello2ccUserPresetPath(projectDir)
    const projectPath = getHello2ccProjectPresetPath(projectDir)
    const expected = JSON.stringify(
      buildRecommendedHello2ccProjectSettings(projectDir),
      null,
      2,
    )

    expect(hello2ccInitCommand.name).toBe('hello2cc-init')
    expect(hello2ccInitCommand.aliases).toContain('hello2cc-config')
    expect(result.type).toBe('text')
    expect(result.value).toContain(userPath)
    expect(result.value).toContain(projectPath)
    expect(await readFile(userPath, 'utf8')).toContain(expected)
    expect(await readFile(projectPath, 'utf8')).toContain(expected)
  })

  test('blocks team broadcast without an active team context', () => {
    const state = makeSessionState()

    const result = checkToolPreconditions(
      'SendMessage',
      {
        to: '*',
        message: 'Please report progress',
      },
      state,
    )

    expect(result.blocked).toBe(true)
    expect(result.reason).toContain('active team context')
  })

  test('restores a persisted orchestration snapshot for resume', () => {
    const state = makeSessionState()
    state.lastIntent = analyzeIntentProfile('请继续 Gateway 编排增强实现')
    state.lastRouteGuidance = 'use TeamCreate first'
    state.activeTeamName = 'gateway-workers'
    state.toolFailureCounts.Agent = 2
    state.recentSuccesses.push({
      toolName: 'TeamCreate',
      signature: 'TeamCreate:{"name":"gateway-workers"}',
      summary: 'gateway-workers',
      count: 1,
      updatedAt: '2026-04-06T10:00:00.000Z',
    })

    clearHello2ccSessionState(state.sessionId)
    const snapshot = snapshotHello2ccSessionState(state)
    const restored = restoreHello2ccSessionState(snapshot)

    expect(restored?.activeTeamName).toBe('gateway-workers')
    expect(restored?.toolFailureCounts.Agent).toBe(2)
    expect(getHello2ccSessionState(state.sessionId)?.lastRouteGuidance).toBe(
      'use TeamCreate first',
    )
  })

  test('formats consistent health and resume summaries', () => {
    const state = makeSessionState()
    state.lastIntent = analyzeIntentProfile('请继续 Gateway 编排增强实现')
    state.activeTeamName = 'gateway-workers'
    state.activeWorktreePath = '/tmp/gateway-workers'
    state.toolFailureCounts.Agent = 2
    state.recentSuccesses.push({
      toolName: 'TeamCreate',
      signature: 'TeamCreate:{"name":"gateway-workers"}',
      summary: 'gateway-workers',
      count: 1,
      updatedAt: '2026-04-06T10:00:00.000Z',
    })
    state.recentFailures.push({
      toolName: 'Agent',
      signature: 'Agent:{"description":"worker"}',
      summary: 'missing worktree isolation',
      count: 2,
      updatedAt: '2026-04-06T10:05:00.000Z',
    })

    expect(buildHello2ccHealthSummary(state)).toBe(
      'intent=implement · 4 capabilities · 2 MCP connected · team=gateway-workers · worktree=active · 1 success · 1 failure · 2 total retries',
    )
    expect(buildHello2ccResumeSummary(state)).toBe(
      'Restored hello2cc orchestration memory: team=gateway-workers · worktree=/tmp/gateway-workers · intent=implement · 1 success · 1 failure · 4 capabilities',
    )
    expect(buildHello2ccResumeSummary(state, 'compact')).toBe(
      'Restored hello2cc orchestration memory: intent=implement · 4 capabilities · 2 MCP connected · team=gateway-workers · worktree=active · 1 success · 1 failure · 2 total retries',
    )
  })

  test('escalates route guidance when retry pressure is high', () => {
    const state = makeSessionState()
    state.toolFailureCounts.Agent = 3

    const guidance = buildRouteGuidance(
      state,
      analyzeIntentProfile('请继续实现这个 Gateway 变更'),
    )

    expect(guidance).toContain('session retry pressure is elevated (3 total retries)')
  })
})
