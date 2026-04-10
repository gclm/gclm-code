import type { Tool, ToolUseContext } from '../../../Tool.js'
import type { ChainState, PermissionEvaluator } from './types.js'
import type { DecisionResult } from './DecisionResult.js'
import { createPermissionRequestMessage } from '../permissions.js'
import { logForDebugging } from '../../../utils/debug.js'
import { jsonStringify } from '../../../utils/slowOperations.js'

/**
 * Step 3: Convert "passthrough" to "ask".
 * Final evaluator — always returns a verdict.
 * If toolPermissionResult was 'passthrough', converts to 'ask'.
 * Otherwise returns the tool's actual result (allow or ask).
 */
export const passthroughEvaluator: PermissionEvaluator = {
  name: 'passthrough',
  async evaluate(
    tool: Tool,
    _input: Record<string, unknown>,
    _context: ToolUseContext,
    chainState: ChainState,
  ): Promise<DecisionResult> {
    const toolResult = chainState.toolPermissionResult!

    if (toolResult.behavior === 'passthrough') {
      return {
        verdict: 'ask',
        reason: createPermissionRequestMessage(
          tool.name,
          toolResult.decisionReason,
        ),
        metadata: {
          evaluatorName: 'passthrough',
        },
        suggestions: toolResult.suggestions,
        blockedPath: toolResult.blockedPath,
        pendingClassifierCheck:
          'pendingClassifierCheck' in toolResult
            ? toolResult.pendingClassifierCheck
            : undefined,
      }
    }

    // Tool returned 'allow' or 'ask' — pass through
    if (toolResult.behavior === 'allow') {
      return {
        verdict: 'allow',
        updatedInput: toolResult.updatedInput,
        metadata: {
          evaluatorName: 'passthrough',
          reasonType: toolResult.decisionReason?.type,
        },
        suggestions: toolResult.suggestions,
      }
    }

    // Tool returned 'ask' (not from rule or safetyCheck — those are handled by 1f/1g)
    return {
      verdict: 'ask',
      reason: toolResult.message,
      metadata: {
        evaluatorName: 'passthrough',
        reasonType: toolResult.decisionReason?.type,
      },
      suggestions: toolResult.suggestions,
      blockedPath: toolResult.blockedPath,
      pendingClassifierCheck:
        'pendingClassifierCheck' in toolResult
          ? toolResult.pendingClassifierCheck
          : undefined,
    }
  },
}
