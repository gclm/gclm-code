import type { Tool, ToolUseContext } from '../../../Tool.js'
import type { DecisionResult } from './DecisionResult.js'
import type { ChainState, PermissionEvaluator } from './types.js'

/**
 * Runs evaluators in order until one returns a non-pass verdict.
 * Mirrors the current sequential if-else flow in hasPermissionsToUseToolInner,
 * but each step is an independent, testable module.
 */
export async function runEvaluatorChain(
  evaluators: PermissionEvaluator[],
  tool: Tool,
  input: Record<string, unknown>,
  context: ToolUseContext,
): Promise<DecisionResult> {
  const chainState: ChainState = {}
  const priorResults = new Map<string, DecisionResult>()

  for (const evaluator of evaluators) {
    if (context.abortController.signal.aborted) {
      return {
        verdict: 'deny',
        reason: 'Operation aborted',
        metadata: { evaluatorName: evaluator.name },
      }
    }

    const result = await evaluator.evaluate(tool, input, context, chainState)
    if (result !== null && result.verdict !== 'pass') {
      priorResults.set(evaluator.name, result)
      return result
    }
    if (result !== null) {
      priorResults.set(evaluator.name, result)
    }
  }

  // Default: if no evaluator claimed the decision, fall back to 'ask'
  return {
    verdict: 'ask',
    reason: `Permission to use ${tool.name} requires approval`,
    metadata: { evaluatorName: 'default' },
  }
}
