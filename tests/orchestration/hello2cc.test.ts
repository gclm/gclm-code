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
  computeRouteGuidanceSignature,
} from '../../src/orchestration/hello2cc/routeGuidance.ts'
import {
  getGatewayOrchestrationState,
  restoreHello2ccSessionState as restoreGatewayOrchestrationState,
} from '../../src/orchestration/hello2cc/index.ts'
import {
  buildHello2ccHealthSummary,
  buildHello2ccResumeSummary,
} from '../../src/orchestration/hello2cc/summary.ts'
import {
  clearHello2ccSessionState,
  getHello2ccSessionState,
  rememberToolSuccess,
  restoreHello2ccSessionState,
  snapshotHello2ccSessionState,
} from '../../src/orchestration/hello2cc/sessionState.ts'
import { normalizeToolInput } from '../../src/orchestration/hello2cc/toolNormalization.ts'
import { suggestSubagentType } from '../../src/orchestration/hello2cc/subagentGuidance.ts'
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
      profile: 'balanced',
      model: 'gateway-main',
    },
    toolFailureCounts: {},
    recentSuccesses: [],
    recentFailures: [],
    fileEditFailures: [],
  }
}

describe('hello2cc orchestration', () => {
  const originalCwd = getOriginalCwd()
  const originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR

  beforeEach(() => {
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

    expect(guidance).toContain('Specialization: implement')
    expect(guidance).toContain('Active team "gateway-workers" exists')
    expect(guidance).toContain('SendMessage to existing worker > Spawn new Agent')
    expect(guidance).toContain('Tool search confidence is low')
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
      'Qwen-family models usually respond better with host-visible structure',
    )

    const deepseekState = makeSessionState()
    deepseekState.capabilities.model = 'deepseek-r1'
    deepseekState.capabilities.profile = 'strict'
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
    expect(result.notes.join(' ')).toContain('Identify constraints')
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
    expect(result.notes.join(' ')).toContain('Explore subagent is unavailable')
    expect(result.notes.join(' ')).toContain('read-only')
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
    expect(retryCheck.reason).toContain('failed 2 times')
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
    expect(result.reason).toContain('active team')
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

    expect(guidance).toContain('Retry pressure is high (3 total retries)')
  })

  test('blocks file edit after repeated failures', () => {
    const state = makeSessionState()
    state.fileEditFailures.push({
      filePath: 'src/query.ts',
      errorType: 'edit_invalid',
      count: 3,
      lastError: 'Edit failed: old_string not found',
      updatedAt: '2026-04-09T10:00:00.000Z',
    })

    const result = checkToolPreconditions(
      'Edit',
      { file_path: 'src/query.ts', old_string: 'old code', new_string: 'new code' },
      state,
    )

    expect(result.blocked).toBe(true)
    expect(result.reason).toContain('src/query.ts')
    expect(result.reason).toContain('failed 3 times')
  })

  test('universal guidance includes role, playbook, and recovery', () => {
    const state = makeSessionState()
    state.toolFailureCounts.Write = 2
    state.recentFailures.push({
      toolName: 'Write',
      signature: 'Write:{"file_path":"src/foo.ts"}',
      summary: 'permission denied',
      count: 2,
      updatedAt: '2026-04-09T10:00:00.000Z',
    })

    const guidance = buildRouteGuidance(
      state,
      analyzeIntentProfile('Please implement the change'),
    )

    expect(guidance).toContain('Role:')
    expect(guidance).toContain('Execution Playbook')
    expect(guidance).toContain('Recovery')
    expect(guidance).toContain('Write')
  })

  test('route guidance signature deduplicates identical prompts', () => {
    const state = makeSessionState()
    const intent1 = analyzeIntentProfile('请继续实现 Gateway 编排增强')
    const sig1 = computeRouteGuidanceSignature(state, intent1)
    const intent2 = analyzeIntentProfile('请继续实现 Gateway 编排增强')
    const sig2 = computeRouteGuidanceSignature(state, intent2)

    expect(sig1).toBe(sig2)
  })

  test('route guidance signature changes when intent or state differs', () => {
    const state = makeSessionState()
    const intent1 = analyzeIntentProfile('请继续实现 Gateway 编排增强')
    const sig1 = computeRouteGuidanceSignature(state, intent1)

    state.activeTeamName = 'gateway-workers'
    const intent2 = analyzeIntentProfile('请继续实现 Gateway 编排增强')
    const sig2 = computeRouteGuidanceSignature(state, intent2)

    expect(sig1).not.toBe(sig2)
  })

  test('route guidance signature changes when intent kind differs', () => {
    const state = makeSessionState()
    const implIntent = analyzeIntentProfile('请实现这个功能')
    const reviewIntent = analyzeIntentProfile('请 review 一下这个实现')

    const sig1 = computeRouteGuidanceSignature(state, implIntent)
    const sig2 = computeRouteGuidanceSignature(state, reviewIntent)

    expect(sig1).not.toBe(sig2)
  })

  test('blocks duplicate TeamCreate with the same active team name', () => {
    const state = makeSessionState()
    state.activeTeamName = 'gateway-workers'

    const result = checkToolPreconditions(
      'TeamCreate',
      { team_name: 'gateway-workers' },
      state,
    )

    expect(result.blocked).toBe(true)
    expect(result.reason).toContain('gateway-workers')
    expect(result.reason).toContain('already the active team')
  })

  test('allows TeamCreate with a different name', () => {
    const state = makeSessionState()
    state.activeTeamName = 'gateway-workers'

    const result = checkToolPreconditions(
      'TeamCreate',
      { name: 'new-team' },
      state,
    )

    expect(result.blocked).toBe(false)
  })

  test('blocks file edit after 3 general failures', () => {
    const state = makeSessionState()
    state.fileEditFailures = [
      { filePath: 'src/query.ts', errorType: 'edit_invalid', count: 3, lastError: 'old_string not found', updatedAt: '2026-04-09T10:00:00.000Z' },
    ]

    const result = checkToolPreconditions(
      'Edit',
      { file_path: 'src/query.ts', old_string: 'old code', new_string: 'new code' },
      state,
    )

    expect(result.blocked).toBe(true)
    expect(result.reason).toContain('src/query.ts')
    expect(result.reason).toContain('3 times')
  })

  test('blocks file edit after 2 permission failures', () => {
    const state = makeSessionState()
    state.fileEditFailures = [
      { filePath: 'etc/hosts', errorType: 'permission', count: 2, lastError: 'EACCES', updatedAt: '2026-04-09T10:00:00.000Z' },
    ]

    const result = checkToolPreconditions(
      'Write',
      { file_path: 'etc/hosts', content: 'test' },
      state,
    )

    expect(result.blocked).toBe(true)
    expect(result.reason).toContain('permission')
  })

  test('does not block file edit for a different file', () => {
    const state = makeSessionState()
    state.fileEditFailures = [
      { filePath: 'src/query.ts', errorType: 'edit_invalid', count: 3, lastError: 'old_string not found', updatedAt: '2026-04-09T10:00:00.000Z' },
    ]

    const result = checkToolPreconditions(
      'Edit',
      { file_path: 'src/other.ts', old_string: 'old', new_string: 'new' },
      state,
    )

    expect(result.blocked).toBe(false)
  })

  test('remembers tool success and resets failure count', () => {
    const state = makeSessionState()
    state.sessionId = 'test-session'
    state.toolFailureCounts.Agent = 3

    restoreHello2ccSessionState(snapshotHello2ccSessionState(state))

    rememberToolSuccess('test-session', 'Agent', { description: 'test' }, 'completed')

    const restored = getHello2ccSessionState('test-session')
    expect(restored?.toolFailureCounts.Agent).toBe(0)

    clearHello2ccSessionState('test-session')
  })

  test('route guidance deduplication: identical signature produces identical guidance text', () => {
    const state = makeSessionState()
    const intent1 = analyzeIntentProfile('请继续实现 Gateway 编排增强')
    const guidance1 = buildRouteGuidance(state, intent1)
    const sig1 = computeRouteGuidanceSignature(state, intent1)

    // Same prompt, same state → same signature → same guidance
    const intent2 = analyzeIntentProfile('请继续实现 Gateway 编排增强')
    const sig2 = computeRouteGuidanceSignature(state, intent2)
    const guidance2 = buildRouteGuidance(state, intent2)

    expect(sig1).toBe(sig2)
    expect(guidance1).toBe(guidance2)
  })

  test('resume with empty state does not crash', () => {
    const restored = restoreHello2ccSessionState(undefined)
    expect(restored).toBeUndefined()
  })

  test('resume with partial state (no intent, no guidance) restores without errors', () => {
    const state = makeSessionState()
    delete state.lastIntent
    delete state.lastRouteGuidance
    state.sessionId = 'partial-session'

    restoreHello2ccSessionState(snapshotHello2ccSessionState(state))
    const restored = getHello2ccSessionState('partial-session')

    expect(restored?.sessionId).toBe('partial-session')
    expect(restored?.lastIntent).toBeUndefined()
    expect(restored?.lastRouteGuidance).toBeUndefined()

    clearHello2ccSessionState('partial-session')
  })

  test('resume with state missing recentSuccesses/recentFailures arrays restores safely', () => {
    const partialState = {
      sessionId: 'corrupt-session',
      capabilities: {
        cwd: '/repo',
        toolNames: ['Agent', 'SendMessage'],
        supportsAgent: true,
        supportsTeam: false,
        supportsMessaging: true,
        supportsWorktree: false,
        availableSubagentTypes: ['Plan'],
        mcpConnectedCount: 0,
        mcpPendingCount: 0,
        mcpNeedsAuthCount: 0,
        mcpFailedCount: 0,
        toolSearchOptimistic: false,
        webSearchAvailable: false,
        webSearchRequests: 0,
        profile: 'balanced' as const,
      },
      toolFailureCounts: {},
    } as any

    restoreHello2ccSessionState(partialState)
    const restored = getHello2ccSessionState('corrupt-session')

    expect(restored?.sessionId).toBe('corrupt-session')
    expect(restored?.recentSuccesses).toEqual([])
    expect(restored?.recentFailures).toEqual([])
    expect(restored?.fileEditFailures).toEqual([])

    clearHello2ccSessionState('corrupt-session')
  })

  test('file edit block includes recovery advice for edit_invalid', () => {
    const state = makeSessionState()
    state.fileEditFailures = [
      { filePath: 'src/query.ts', errorType: 'edit_invalid', count: 3, lastError: 'old_string not found', updatedAt: '2026-04-09T10:00:00.000Z' },
    ]

    const result = checkToolPreconditions(
      'Edit',
      { file_path: 'src/query.ts', old_string: 'old code', new_string: 'new code' },
      state,
    )

    expect(result.blocked).toBe(true)
    expect(result.notes.join(' ')).toContain('read the file first')
  })

  test('file edit block includes recovery advice for permission errors', () => {
    const state = makeSessionState()
    state.fileEditFailures = [
      { filePath: '/etc/hosts', errorType: 'permission', count: 2, lastError: 'EACCES', updatedAt: '2026-04-09T10:00:00.000Z' },
    ]

    const result = checkToolPreconditions(
      'Write',
      { file_path: '/etc/hosts', content: 'test' },
      state,
    )

    expect(result.blocked).toBe(true)
    expect(result.notes.join(' ')).toContain('ls -la')
  })

  test('subagent guidance routes planning intent to Plan subagent', () => {
    const state = makeSessionState()
    state.lastIntent = analyzeIntentProfile('请先规划这个 Gateway 变更')

    const result = suggestSubagentType('Agent', { description: 'plan it' }, state)

    expect(result.subagentType).toBe('Plan')
    expect(result.note).toContain('planning')
  })

  test('subagent guidance returns Explore for review intent', () => {
    const state = makeSessionState()
    state.lastIntent = analyzeIntentProfile('请 review 一下这个实现')

    const result = suggestSubagentType('Agent', { description: 'review it' }, state)

    expect(result.subagentType).toBe('Explore')
    expect(result.note).toContain('Review')
  })

  test('subagent guidance returns empty when Explore is unavailable for research', () => {
    const state = makeSessionState()
    state.capabilities.availableSubagentTypes = ['Plan', 'GeneralPurpose']
    state.lastIntent = analyzeIntentProfile('请先研究一下这个方案的可行性')

    const result = suggestSubagentType('Agent', { description: 'research' }, state)

    expect(result.subagentType).toBeUndefined()
    expect(result.shapingNotes.join(' ')).toContain('read-only')
  })

  test('subagent guidance returns empty when no intent is set', () => {
    const state = makeSessionState()

    const result = suggestSubagentType('Agent', { description: 'do something' }, state)

    expect(result.subagentType).toBeUndefined()
    expect(result.shapingNotes).toHaveLength(0)
  })

  test('subagent guidance skips for non-Agent tools', () => {
    const state = makeSessionState()
    state.lastIntent = analyzeIntentProfile('请先规划一下')

    const result = suggestSubagentType('SendMessage', { to: 'worker-1', message: 'hi' }, state)

    expect(result.subagentType).toBeUndefined()
    expect(result.shapingNotes).toHaveLength(0)
  })

  test('SendMessage to named recipient without active team is not blocked', () => {
    const state = makeSessionState()

    const result = checkToolPreconditions(
      'SendMessage',
      { to: 'worker-1', message: 'please report' },
      state,
    )

    expect(result.blocked).toBe(false)
  })

  test('SendMessage broadcast with active team is not blocked', () => {
    const state = makeSessionState()
    state.activeTeamName = 'gateway-workers'

    const result = checkToolPreconditions(
      'SendMessage',
      { to: '*', message: 'please report' },
      state,
    )

    expect(result.blocked).toBe(false)
  })
})
