import type { Tool, ToolUseContext } from '../../../Tool.js'
import type { DecisionResult } from './DecisionResult.js'
import type { ChainState, PermissionEvaluator } from './types.js'
import { getDenyRuleForTool } from '../permissions.js'

/**
 * Step 1a: Check if the entire tool is denied by a rule.
 * Deny rules are absolute — no mode can override them.
 */
export const denyRuleEvaluator: PermissionEvaluator = {
  name: 'denyRule',
  async evaluate(
    tool: Tool,
    _input: Record<string, unknown>,
    context: ToolUseContext,
    _chainState: ChainState,
  ): Promise<DecisionResult | null> {
    const appState = context.getAppState()
    const denyRule = getDenyRuleForTool(appState.toolPermissionContext, tool)
    if (denyRule) {
      return {
        verdict: 'deny',
        reason: `Permission to use ${tool.name} has been denied.`,
        metadata: {
          evaluatorName: 'denyRule',
          reasonType: 'rule',
          rule: denyRule,
        },
      }
    }
    return null
  },
}
