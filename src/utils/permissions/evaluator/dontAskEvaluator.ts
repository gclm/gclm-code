import type { DecisionResult } from './DecisionResult.js'

/**
 * Result transformer for dontAsk mode.
 * Converts any 'ask' verdict to 'deny'.
 *
 * Usage: register as `resultTransformer` in the mode registry.
 */
export function dontAskResultTransformer(
  result: DecisionResult,
  toolName: string,
): DecisionResult {
  if (result.verdict !== 'ask') {
    return result
  }

  return {
    verdict: 'deny',
    reason: `${toolName} is not allowed in dontAsk mode`,
    metadata: {
      evaluatorName: 'dontAsk',
      reasonType: 'mode',
      mode: 'dontAsk',
    },
  }
}
