import type { Tool, ToolUseContext } from '../../../Tool.js'
import type { ChainState, PermissionEvaluator } from './types.js'
import type { DecisionResult } from './DecisionResult.js'

/**
 * Step 1e: Tool requires user interaction even in bypass mode.
 * If tool.requiresUserInteraction() returns true and the tool's checkPermissions
 * returned 'ask', this is bypass-immune.
 */
export const userInteractionEvaluator: PermissionEvaluator = {
  name: 'userInteraction',
  async evaluate(
    tool: Tool,
    _input: Record<string, unknown>,
    _context: ToolUseContext,
    chainState: ChainState,
  ): Promise<DecisionResult | null> {
    const toolResult = chainState.toolPermissionResult
    if (
      tool.requiresUserInteraction?.() &&
      toolResult?.behavior === 'ask'
    ) {
      return {
        verdict: 'ask',
        reason: toolResult.message,
        metadata: {
          evaluatorName: 'userInteraction',
          reasonType: 'other',
        },
        suggestions: 'suggestions' in toolResult ? toolResult.suggestions : undefined,
      }
    }
    return null
  },
}
