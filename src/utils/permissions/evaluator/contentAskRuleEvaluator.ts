import type { Tool, ToolUseContext } from '../../../Tool.js'
import type { ChainState, PermissionEvaluator } from './types.js'
import type { DecisionResult } from './DecisionResult.js'

/**
 * Step 1f: Content-specific ask rules from tool.checkPermissions.
 * When a user explicitly configures a content-specific ask rule
 * (e.g. Bash(npm publish:*)), this must be respected even in bypass mode.
 */
export const contentAskRuleEvaluator: PermissionEvaluator = {
  name: 'contentAskRule',
  async evaluate(
    _tool: Tool,
    _input: Record<string, unknown>,
    _context: ToolUseContext,
    chainState: ChainState,
  ): Promise<DecisionResult | null> {
    const toolResult = chainState.toolPermissionResult
    if (
      toolResult?.behavior === 'ask' &&
      toolResult.decisionReason?.type === 'rule' &&
      toolResult.decisionReason.rule.ruleBehavior === 'ask'
    ) {
      return {
        verdict: 'ask',
        reason: toolResult.message,
        metadata: {
          evaluatorName: 'contentAskRule',
          reasonType: 'rule',
          rule: toolResult.decisionReason.rule,
        },
        suggestions: 'suggestions' in toolResult ? toolResult.suggestions : undefined,
      }
    }
    return null
  },
}
