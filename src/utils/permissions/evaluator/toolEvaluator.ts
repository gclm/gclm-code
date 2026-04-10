import type { Tool, ToolUseContext } from '../../../Tool.js'
import { AbortError } from '../../../utils/errors.js'
import { APIUserAbortError } from '@anthropic-ai/sdk'
import { logError } from '../../../utils/log.js'
import type { DecisionResult } from './DecisionResult.js'
import type { ChainState, PermissionEvaluator } from './types.js'
import { createPermissionRequestMessage } from '../permissions.js'

/**
 * Step 1c: Ask the tool implementation for a permission result.
 * Stores the result in chainState so downstream evaluators (1d-3) can inspect it.
 * This evaluator itself never returns a verdict — it delegates to later evaluators.
 */
export const toolEvaluator: PermissionEvaluator = {
  name: 'tool',
  async evaluate(
    tool: Tool,
    input: Record<string, unknown>,
    context: ToolUseContext,
    chainState: ChainState,
  ): Promise<DecisionResult | null> {
    let toolPermissionResult = {
      behavior: 'passthrough' as const,
      message: createPermissionRequestMessage(tool.name),
    }
    try {
      const parsedInput = tool.inputSchema.parse(input)
      toolPermissionResult = await tool.checkPermissions(parsedInput, context)
    } catch (e) {
      if (e instanceof AbortError || e instanceof APIUserAbortError) {
        throw e
      }
      logError(e)
    }

    // Store for downstream evaluators (1d, 1e, 1f, 1g, 2a, 2b, 3)
    chainState.toolPermissionResult = toolPermissionResult

    // This evaluator never returns a verdict — steps 1d-1g and 2a/2b/3
    // inspect chainState.toolPermissionResult and decide.
    return null
  },
}
