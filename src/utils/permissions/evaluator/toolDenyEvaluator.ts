import type { Tool, ToolUseContext } from '../../../Tool.js'
import type { ChainState, PermissionEvaluator } from './types.js'
import type { DecisionResult } from './DecisionResult.js'

/**
 * Step 1d: Tool implementation denied permission.
 * If tool.checkPermissions returned 'deny', this is absolute.
 */
export const toolDenyEvaluator: PermissionEvaluator = {
  name: 'toolDeny',
  async evaluate(
    _tool: Tool,
    _input: Record<string, unknown>,
    _context: ToolUseContext,
    chainState: ChainState,
  ): Promise<DecisionResult | null> {
    const toolResult = chainState.toolPermissionResult
    if (toolResult?.behavior === 'deny') {
      return {
        verdict: 'deny',
        reason: toolResult.message,
        metadata: {
          evaluatorName: 'toolDeny',
          reasonType: toolResult.decisionReason?.type ?? 'other',
        },
        suggestions: 'suggestions' in toolResult ? toolResult.suggestions : undefined,
      }
    }
    return null
  },
}
