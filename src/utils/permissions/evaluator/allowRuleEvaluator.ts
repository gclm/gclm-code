import type { Tool, ToolUseContext } from '../../../Tool.js'
import type { ChainState, PermissionEvaluator } from './types.js'
import type { DecisionResult } from './DecisionResult.js'
import { toolAlwaysAllowedRule } from '../permissions.js'

/**
 * Step 2b: Entire tool is allowed by an allow rule.
 */
export const allowRuleEvaluator: PermissionEvaluator = {
  name: 'allowRule',
  async evaluate(
    tool: Tool,
    input: Record<string, unknown>,
    context: ToolUseContext,
    chainState: ChainState,
  ): Promise<DecisionResult | null> {
    const appState = context.getAppState()
    const alwaysAllowedRule = toolAlwaysAllowedRule(
      appState.toolPermissionContext,
      tool,
    )
    if (alwaysAllowedRule) {
      const toolResult = chainState.toolPermissionResult
      const updatedInput =
        toolResult && 'updatedInput' in toolResult
          ? toolResult.updatedInput ?? input
          : input

      return {
        verdict: 'allow',
        updatedInput,
        metadata: {
          evaluatorName: 'allowRule',
          reasonType: 'rule',
          rule: alwaysAllowedRule,
        },
        suggestions:
          toolResult && 'suggestions' in toolResult
            ? toolResult.suggestions
            : undefined,
      }
    }
    return null
  },
}
