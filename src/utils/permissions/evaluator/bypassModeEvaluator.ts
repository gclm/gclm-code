import type { Tool, ToolUseContext } from '../../../Tool.js'
import type { ChainState, PermissionEvaluator } from './types.js'
import type { DecisionResult } from './DecisionResult.js'

/**
 * Step 2a: Check if mode allows bypassing all permissions.
 * - Direct bypassPermissions mode
 * - Plan mode when the user originally started with bypass mode
 */
export const bypassModeEvaluator: PermissionEvaluator = {
  name: 'bypassMode',
  async evaluate(
    tool: Tool,
    input: Record<string, unknown>,
    context: ToolUseContext,
    chainState: ChainState,
  ): Promise<DecisionResult | null> {
    const appState = context.getAppState()
    const shouldBypassPermissions =
      appState.toolPermissionContext.mode === 'bypassPermissions' ||
      (appState.toolPermissionContext.mode === 'plan' &&
        appState.toolPermissionContext.isBypassPermissionsModeAvailable)

    if (shouldBypassPermissions) {
      const toolResult = chainState.toolPermissionResult
      const updatedInput =
        toolResult && 'updatedInput' in toolResult
          ? toolResult.updatedInput ?? input
          : input

      return {
        verdict: 'allow',
        updatedInput,
        metadata: {
          evaluatorName: 'bypassMode',
          reasonType: 'mode',
          mode: appState.toolPermissionContext.mode,
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
