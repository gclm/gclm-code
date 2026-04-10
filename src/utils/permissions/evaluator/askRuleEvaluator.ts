import type { Tool, ToolUseContext } from '../../../Tool.js'
import type { DecisionResult } from './DecisionResult.js'
import type { ChainState, PermissionEvaluator } from './types.js'
import { getAskRuleForTool } from '../permissions.js'
import { shouldUseSandbox } from '../../../tools/BashTool/shouldUseSandbox.js'
import { BASH_TOOL_NAME } from '../../../tools/BashTool/toolName.js'
import { SandboxManager } from '../../../utils/sandbox/sandbox-adapter.js'
import { createPermissionRequestMessage } from '../permissions.js'

/**
 * Step 1b: Check if the entire tool has an "ask" rule.
 * Special case: sandboxed Bash commands can skip the ask rule via auto-allow.
 */
export const askRuleEvaluator: PermissionEvaluator = {
  name: 'askRule',
  async evaluate(
    tool: Tool,
    input: Record<string, unknown>,
    context: ToolUseContext,
    _chainState: ChainState,
  ): Promise<DecisionResult | null> {
    const appState = context.getAppState()
    const askRule = getAskRuleForTool(appState.toolPermissionContext, tool)
    if (askRule) {
      // When autoAllowBashIfSandboxed is on, sandboxed commands skip the ask rule
      const canSandboxAutoAllow =
        tool.name === BASH_TOOL_NAME &&
        SandboxManager.isSandboxingEnabled() &&
        SandboxManager.isAutoAllowBashIfSandboxedEnabled() &&
        shouldUseSandbox(input)

      if (!canSandboxAutoAllow) {
        return {
          verdict: 'ask',
          reason: createPermissionRequestMessage(tool.name),
          metadata: {
            evaluatorName: 'askRule',
            reasonType: 'rule',
            rule: askRule,
          },
        }
      }
      // Fall through to let tool.checkPermissions handle command-specific rules
    }
    return null
  },
}
