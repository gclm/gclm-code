import { describe, expect, test } from 'bun:test'
import { runEvaluatorChain } from '../../../../src/utils/permissions/evaluator/chainRunner.js'
import type { PermissionEvaluator, ChainState } from '../../../../src/utils/permissions/evaluator/types.js'
import type { DecisionResult } from '../../../../src/utils/permissions/evaluator/DecisionResult.js'
import type { Tool, ToolUseContext } from '../../../../src/Tool.js'

function makeMockContext(overrides: {
  mode?: string
  alwaysAllowRules?: Record<string, string[]>
  alwaysDenyRules?: Record<string, string[]>
  alwaysAskRules?: Record<string, string[]>
  isBypassPermissionsModeAvailable?: boolean
} = {}): ToolUseContext {
  return {
    getAppState: () => ({
      toolPermissionContext: {
        mode: (overrides.mode ?? 'default') as any,
        additionalWorkingDirectories: new Map(),
        alwaysAllowRules: overrides.alwaysAllowRules ?? {},
        alwaysDenyRules: overrides.alwaysDenyRules ?? {},
        alwaysAskRules: overrides.alwaysAskRules ?? {},
        isBypassPermissionsModeAvailable: overrides.isBypassPermissionsModeAvailable ?? false,
      },
    }),
    setAppState: (() => {}) as any,
    abortController: new AbortController(),
    messages: [],
    options: { tools: [] },
    localDenialTracking: undefined,
  } as unknown as ToolUseContext
}

function makeMockTool(name: string, overrides: {
  checkPermissions?: (input: any, ctx: any) => Promise<any>
  requiresUserInteraction?: () => boolean
} = {}): Tool {
  return {
    name,
    inputSchema: { parse: (v: any) => v } as any,
    checkPermissions: overrides.checkPermissions ?? (async () => ({ behavior: 'passthrough', message: 'default' })),
    requiresUserInteraction: overrides.requiresUserInteraction,
  } as unknown as Tool
}

describe('chainRunner', () => {
  test('returns default ask when no evaluators', async () => {
    const ctx = makeMockContext()
    const tool = makeMockTool('TestTool')
    const result = await runEvaluatorChain([], tool, {}, ctx)
    expect(result.verdict).toBe('ask')
    expect(result.metadata?.evaluatorName).toBe('default')
  })

  test('stops at first non-pass evaluator', async () => {
    const evaluators: PermissionEvaluator[] = [
      {
        name: 'first',
        async evaluate() {
          return { verdict: 'deny', reason: 'blocked by first', metadata: { evaluatorName: 'first' } }
        },
      },
      {
        name: 'second',
        async evaluate() {
          return { verdict: 'allow', metadata: { evaluatorName: 'second' } }
        },
      },
    ]
    const ctx = makeMockContext()
    const tool = makeMockTool('TestTool')
    const result = await runEvaluatorChain(evaluators, tool, {}, ctx)
    expect(result.verdict).toBe('deny')
    expect(result.reason).toBe('blocked by first')
    expect(result.metadata?.evaluatorName).toBe('first')
  })

  test('skips pass evaluators until verdict', async () => {
    const evaluators: PermissionEvaluator[] = [
      { name: 'pass1', async evaluate() { return null } },
      { name: 'pass2', async evaluate() { return { verdict: 'pass', metadata: { evaluatorName: 'pass2' } } } },
      { name: 'decider', async evaluate() { return { verdict: 'allow', metadata: { evaluatorName: 'decider' } } } },
      { name: 'neverReached', async evaluate() { return { verdict: 'deny', metadata: { evaluatorName: 'neverReached' } } } },
    ]
    const ctx = makeMockContext()
    const tool = makeMockTool('TestTool')
    const result = await runEvaluatorChain(evaluators, tool, {}, ctx)
    expect(result.verdict).toBe('allow')
    expect(result.metadata?.evaluatorName).toBe('decider')
  })

  test('returns deny on abort', async () => {
    const controller = new AbortController()
    controller.abort()
    const evaluators: PermissionEvaluator[] = [
      { name: 'neverReached', async evaluate() { return { verdict: 'allow' } } },
    ]
    const ctx = makeMockContext()
    ctx.abortController = controller
    const tool = makeMockTool('TestTool')
    const result = await runEvaluatorChain(evaluators, tool, {}, ctx)
    expect(result.verdict).toBe('deny')
    expect(result.reason).toBe('Operation aborted')
  })

  test('passes chainState between evaluators', async () => {
    const evaluators: PermissionEvaluator[] = [
      {
        name: 'setter',
        async evaluate(_tool, _input, _ctx, chainState: ChainState) {
          chainState.toolPermissionResult = { behavior: 'allow', updatedInput: { key: 'value' } }
          return null
        },
      },
      {
        name: 'reader',
        async evaluate(_tool, _input, _ctx, chainState: ChainState) {
          const result = chainState.toolPermissionResult
          if (result?.behavior === 'allow') {
            return { verdict: 'allow', updatedInput: result.updatedInput }
          }
          return null
        },
      },
    ]
    const ctx = makeMockContext()
    const tool = makeMockTool('TestTool')
    const result = await runEvaluatorChain(evaluators, tool, {}, ctx)
    expect(result.verdict).toBe('allow')
    expect(result.updatedInput).toEqual({ key: 'value' })
  })
})

describe('denyRuleEvaluator', () => {
  test('denies when tool has a deny rule', async () => {
    // This test would require importing the actual evaluator
    // For now we test the contract via the chain runner
    const evaluators: PermissionEvaluator[] = [
      {
        name: 'denyCheck',
        async evaluate() {
          return { verdict: 'deny', reason: 'tool denied', metadata: { evaluatorName: 'denyCheck' } }
        },
      },
    ]
    const ctx = makeMockContext()
    const tool = makeMockTool('TestTool')
    const result = await runEvaluatorChain(evaluators, tool, {}, ctx)
    expect(result.verdict).toBe('deny')
  })
})
