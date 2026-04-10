import type { Tool, ToolUseContext } from '../../../Tool.js'
import type { PermissionResult } from '../../../types/permissions.js'
import type { DecisionResult } from './DecisionResult.js'

/**
 * Shared mutable state passed through the evaluator chain.
 * Allows evaluators to communicate — e.g. toolEvaluator stores its result
 * so that 1d/1e/1f/1g/2a/2b/3 can inspect it.
 */
export interface ChainState {
  /** Result from tool.checkPermissions (step 1c), set by toolEvaluator */
  toolPermissionResult?: PermissionResult
}

/**
 * A single evaluator in the permission chain.
 * Returns DecisionResult if it has a verdict, or null to pass to the next evaluator.
 */
export interface PermissionEvaluator {
  /** Unique name for logging and debugging */
  name: string
  /**
   * Evaluate the tool use request.
   * @returns DecisionResult if verdict is reached, null to continue chain
   */
  evaluate(
    tool: Tool,
    input: Record<string, unknown>,
    context: ToolUseContext,
    chainState: ChainState,
  ): Promise<DecisionResult | null>
}

/**
 * Evaluation context passed to each evaluator.
 * Wraps ToolUseContext with chain-specific state.
 */
export interface EvaluationContext {
  /** Original ToolUseContext */
  toolUseContext: ToolUseContext
  /** Shared mutable state for inter-evaluator communication */
  chainState: ChainState
  /** Results from earlier evaluators (for dependency) */
  priorResults: ReadonlyMap<string, DecisionResult>
  /** Chain-level abort signal */
  abortSignal: AbortSignal
}

/**
 * Chain configuration: ordered list of evaluators.
 */
export interface EvaluatorChainConfig {
  evaluators: PermissionEvaluator[]
}
