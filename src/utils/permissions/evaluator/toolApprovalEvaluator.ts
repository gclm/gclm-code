import type { Tool, ToolUseContext } from '../../../Tool.js'
import type { DecisionResult } from './DecisionResult.js'
import type { ChainState, PermissionEvaluator } from './types.js'
import { ApprovalStore } from './Approvable.js'

/**
 * Evaluator that checks the ApprovalStore before delegating to tool.checkPermissions.
 * If a cached approval exists and is not expired, returns 'allow' directly.
 *
 * This evaluator should be placed early in the chain (after deny rules)
 * to short-circuit permission checks for previously-approved actions.
 */
export function createToolApprovalEvaluator(
  store: ApprovalStore,
): PermissionEvaluator {
  return {
    name: 'toolApproval',
    async evaluate(
      tool: Tool,
      input: Record<string, unknown>,
      _context: ToolUseContext,
      _chainState: ChainState,
    ): Promise<DecisionResult | null> {
      // Generate approval key from tool name + input
      const key = generateApprovalKey(tool.name, input)
      const cached = store.get(key)
      if (cached) {
        return cached
      }
      return null
    },
  }
}

/**
 * Generate a cacheable approval key from tool name and input.
 */
function generateApprovalKey(toolName: string, input: Record<string, unknown>): string {
  // Simple key: toolName + JSON of input (sorted keys for consistency)
  const sortedInput = JSON.stringify(input, Object.keys(input).sort())
  return `${toolName}:${sortedInput}`
}

export { ApprovalStore }
