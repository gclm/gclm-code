import type { Tool, ToolUseContext } from '../../../Tool.js'
import type { ChainState, PermissionEvaluator } from './types.js'
import type { DecisionResult } from './DecisionResult.js'

/**
 * Step 1g: Safety checks (e.g. .git/, .claude/, .vscode/, shell configs).
 * These are bypass-immune — must prompt even in bypassPermissions mode.
 * The classifierApprovable flag determines whether auto mode can evaluate
 * this via the classifier or must force a prompt.
 */
export const safetyCheckEvaluator: PermissionEvaluator = {
  name: 'safetyCheck',
  async evaluate(
    _tool: Tool,
    _input: Record<string, unknown>,
    _context: ToolUseContext,
    chainState: ChainState,
  ): Promise<DecisionResult | null> {
    const toolResult = chainState.toolPermissionResult
    if (
      toolResult?.behavior === 'ask' &&
      toolResult.decisionReason?.type === 'safetyCheck'
    ) {
      return {
        verdict: 'ask',
        reason: toolResult.message,
        metadata: {
          evaluatorName: 'safetyCheck',
          reasonType: 'safetyCheck',
          classifierApprovable: toolResult.decisionReason.classifierApprovable,
        },
        suggestions: 'suggestions' in toolResult ? toolResult.suggestions : undefined,
        blockedPath: 'blockedPath' in toolResult ? toolResult.blockedPath : undefined,
      }
    }
    return null
  },
}
