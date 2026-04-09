import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  getSessionId,
  resetStateForTests,
  setOriginalCwd,
  switchSession,
} from '../../src/bootstrap/state.ts'
import {
  clearHello2ccSessionState,
  getHello2ccSessionState,
  restoreHello2ccSessionState,
  snapshotHello2ccSessionState,
} from '../../src/orchestration/hello2cc/sessionState.ts'
import {
  checkGatewayToolPreconditions,
  normalizeGatewayToolInput,
} from '../../src/orchestration/hello2cc/index.ts'
import { analyzeIntentProfile } from '../../src/orchestration/hello2cc/intentProfile.ts'
import { buildRouteGuidance } from '../../src/orchestration/hello2cc/routeGuidance.ts'
import type { Hello2ccSessionState } from '../../src/orchestration/hello2cc/types.ts'
import { createUserMessage } from '../../src/utils/messages.ts'
import { restoreSessionStateFromLog } from '../../src/utils/sessionRestore.ts'
import {
  flushSessionStorage,
  getLastSessionLog,
  saveHello2ccState,
} from '../../src/utils/sessionStorage.ts'
import { buildHello2ccProperties } from '../../src/utils/status.tsx'

const SESSION_ID = '11111111-1111-4111-8111-111111111111' as never
const MESSAGE_ID = '22222222-2222-4222-8222-222222222222'

function makeSessionState(sessionId: string): Hello2ccSessionState {
  return {
    sessionId,
    capabilities: {
      cwd: '/tmp/hello2cc',
      toolNames: ['Agent', 'SendMessage', 'TeamCreate', 'EnterWorktree'],
      supportsAgent: true,
      supportsTeam: true,
      supportsMessaging: true,
      supportsWorktree: true,
      availableSubagentTypes: ['Plan', 'Explore', 'GeneralPurpose'],
      mcpConnectedCount: 2,
      mcpPendingCount: 1,
      mcpNeedsAuthCount: 0,
      mcpFailedCount: 0,
      toolSearchOptimistic: true,
      webSearchAvailable: true,
      webSearchRequests: 1,
      provider: 'firstParty',
      profile: 'balanced',
      model: 'gateway-main',
    },
    lastIntent: {
      rawPrompt: '请继续 Gateway 编排增强',
      primaryIntent: 'implement',
      signals: {
        implement: true,
        review: false,
        verify: false,
        plan: false,
        explore: false,
        externalSystem: true,
        needTeam: true,
        needWorktree: false,
      },
    },
    lastRouteGuidance: 'prefer TeamCreate followed by Agent execution',
    activeTeamName: 'gateway-workers',
    activeWorktreePath: '/tmp/hello2cc-worktree',
    toolFailureCounts: {
      Agent: 2,
      SendMessage: 0,
    },
    recentSuccesses: [
      {
        toolName: 'TeamCreate',
        signature: 'TeamCreate:{"team_name":"gateway-workers"}',
        summary: 'gateway-workers',
        count: 1,
        updatedAt: '2026-04-06T10:00:00.000Z',
      },
    ],
    recentFailures: [
      {
        toolName: 'Agent',
        signature: 'Agent:{"description":"worker"}',
        summary: 'missing worktree isolation',
        count: 2,
        updatedAt: '2026-04-06T10:05:00.000Z',
      },
    ],
    fileEditFailures: [],
  }
}

describe('hello2cc resume integration', () => {
  let tempDir: string | undefined

  beforeEach(() => {
    resetStateForTests()
  })

  afterEach(async () => {
    clearHello2ccSessionState(String(getSessionId()))
    resetStateForTests()
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true })
      tempDir = undefined
    }
  })

  test('/status shows hello2cc orchestration summary for the active session', () => {
    const sessionId = String(getSessionId())
    const state = makeSessionState(sessionId)

    restoreHello2ccSessionState(snapshotHello2ccSessionState(state))

    const properties = buildHello2ccProperties()
    const labels = properties.map(property => property.label)
    const healthSummary = properties.find(
      property => property.label === 'Orchestration health',
    )

    expect(labels).toContain('Orchestration health')
    expect(labels).toContain('Gateway orchestration')
    expect(labels).toContain('Surfaced capabilities')
    expect(labels).toContain('Host facts')
    expect(labels).toContain('Routing posture')
    expect(labels).toContain('Debug snapshot')
    expect(labels).toContain('Last intent')
    expect(labels).toContain('Active team')
    expect(labels).toContain('Recent failures')
    expect(healthSummary?.value).toContain('intent=implement')
    expect(healthSummary?.value).toContain('4 capabilities')
    expect(healthSummary?.value).toContain('team=gateway-workers')
    expect(healthSummary?.value).toContain('lastFailure=Agent')
    const hostFacts = properties.find(property => property.label === 'Host facts')
    const routingPosture = properties.find(
      property => property.label === 'Routing posture',
    )
    const debugSnapshot = properties.find(
      property => property.label === 'Debug snapshot',
    )
    expect(hostFacts?.value).toEqual([
      'MCP connected=2, auth=0, pending=1, failed=0',
      'tool search optimistic=yes',
      'web search available=yes, requests=1',
      'provider=firstParty, strategy=balanced',
      'subagents=Plan, Explore, GeneralPurpose',
    ])
    expect(routingPosture?.value).toEqual([
      'intent=implement',
      'team=gateway-workers',
      'worktree=/tmp/hello2cc-worktree',
      'successes=1',
      'failures=1',
      'retries=2',
      'topFailureTool=Agent',
    ])
    expect(typeof debugSnapshot?.value).toBe('string')
    expect(String(debugSnapshot?.value)).toContain('"sessionId"')
    expect(String(debugSnapshot?.value)).toContain('"memoryPressure"')
  })

  test('persists hello2cc-state to transcript and restores it through the resume path', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'hello2cc-resume-'))
    setOriginalCwd(tempDir)
    switchSession(SESSION_ID, tempDir)

    const transcriptPath = join(tempDir, `${String(SESSION_ID)}.jsonl`)
    const userMessage = createUserMessage({
      content: 'resume hello2cc orchestration state',
      uuid: MESSAGE_ID,
      timestamp: '2026-04-06T10:00:00.000Z',
    })

    await writeFile(
      transcriptPath,
      `${JSON.stringify({
        ...userMessage,
        cwd: tempDir,
        userType: 'external',
        sessionId: String(SESSION_ID),
        version: 'test',
        parentUuid: null,
        isSidechain: false,
      })}\n`,
      'utf8',
    )

    const state = makeSessionState(String(SESSION_ID))
    state.capabilities.cwd = tempDir

    saveHello2ccState(snapshotHello2ccSessionState(state), transcriptPath)
    await flushSessionStorage()

    const log = await getLastSessionLog(SESSION_ID)
    expect(log?.hello2ccState?.activeTeamName).toBe('gateway-workers')
    expect(log?.hello2ccState?.toolFailureCounts.Agent).toBe(2)

    clearHello2ccSessionState(String(SESSION_ID))
    expect(getHello2ccSessionState(String(SESSION_ID))).toBeUndefined()

    restoreSessionStateFromLog(
      { hello2ccState: log?.hello2ccState },
      update => update({} as never),
    )

    const restored = getHello2ccSessionState(String(SESSION_ID))
    expect(restored?.activeTeamName).toBe('gateway-workers')
    expect(restored?.recentFailures[0]?.summary).toBe('missing worktree isolation')
    expect(restored?.toolFailureCounts.Agent).toBe(2)
  })

  test('reuses restored hello2cc memory in the next route guidance and precondition check', () => {
    const sessionId = String(getSessionId())
    const state = makeSessionState(sessionId)

    restoreHello2ccSessionState(snapshotHello2ccSessionState(state))
    const restored = getHello2ccSessionState(sessionId)
    const guidance = buildRouteGuidance(
      restored!,
      analyzeIntentProfile('请继续并行推进这个 Gateway 实现'),
    )

    const precondition = checkGatewayToolPreconditions({
      toolName: 'EnterWorktree',
      input: normalizeGatewayToolInput({
        toolName: 'EnterWorktree',
        input: { name: 'gateway-workers' },
      }),
    })

    expect(guidance).toContain('gateway-workers')
    expect(guidance).toContain('missing worktree isolation')
    expect(precondition.blocked).toBe(true)
    expect(precondition.reason).toContain('/tmp/hello2cc-worktree')
  })
})
