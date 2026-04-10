import type { PermissionMode } from '../../../types/permissions.js'
import type { PermissionEvaluator, EvaluatorChainConfig } from './types.js'
import { buildCoreEvaluatorChain } from '../permissions.js'

/**
 * Mode-specific post-core evaluators and result transformers.
 *
 * The core evaluator chain (1a-3) is shared by all modes.
 * Each mode can add post-core evaluators (e.g. auto mode classifier)
 * and/or a result transformer (e.g. dontAsk converts ask->deny).
 */
export interface ModeEvaluatorConfig {
  /** Mode name */
  mode: PermissionMode
  /**
   * Evaluators to inject AFTER the core evaluators (1a-3)
   * but BEFORE the passthrough fallback.
   */
  postCoreEvaluators: PermissionEvaluator[]
  /**
   * Transform the chain result after all evaluators run.
   * Applied as a final step (e.g., dontAsk: ask->deny).
   */
  resultTransformer?: (result: import('./DecisionResult.js').DecisionResult) => import('./DecisionResult.js').DecisionResult
  /**
   * Feature flag that gates this mode's evaluators.
   */
  featureFlag?: string
}

const registry = new Map<PermissionMode, ModeEvaluatorConfig>()

export function registerMode(config: ModeEvaluatorConfig): void {
  registry.set(config.mode, config)
}

export function getModeConfig(mode: PermissionMode): ModeEvaluatorConfig | undefined {
  return registry.get(mode)
}

/**
 * Build a complete evaluator chain for a given mode.
 * Combines the core chain with mode-specific post-core evaluators.
 */
export function buildChainForMode(mode: PermissionMode): EvaluatorChainConfig {
  const coreEvaluators = buildCoreEvaluatorChain()
  const modeConfig = getModeConfig(mode)

  if (!modeConfig || modeConfig.postCoreEvaluators.length === 0) {
    return { evaluators: coreEvaluators }
  }

  // Check feature flag if set
  if (modeConfig.featureFlag) {
    const { feature } = require('bun:bundle') as { feature: (name: string) => boolean }
    if (!feature(modeConfig.featureFlag)) {
      return { evaluators: coreEvaluators }
    }
  }

  // Insert post-core evaluators BEFORE the passthrough evaluator (last in core)
  // Find the passthrough evaluator index
  const passthroughIndex = coreEvaluators.findIndex(e => e.name === 'passthrough')
  const insertIndex = passthroughIndex >= 0 ? passthroughIndex : coreEvaluators.length

  const combined = [
    ...coreEvaluators.slice(0, insertIndex),
    ...modeConfig.postCoreEvaluators,
    ...coreEvaluators.slice(insertIndex),
  ]

  return { evaluators: combined }
}

/**
 * Apply a mode's result transformer to a chain result.
 */
export function applyModeResultTransformer(
  mode: PermissionMode,
  result: import('./DecisionResult.js').DecisionResult,
): import('./DecisionResult.js').DecisionResult {
  const modeConfig = getModeConfig(mode)
  if (modeConfig?.resultTransformer) {
    return modeConfig.resultTransformer(result)
  }
  return result
}
