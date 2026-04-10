import type { Tool, ToolUseContext } from '../../../Tool.js'
import { AUTO_REJECT_MESSAGE } from '../../../utils/messages.js'
import { executePermissionRequestHooks } from '../../../utils/hooks.js'
import { AbortError, toError } from '../../../utils/errors.js'
import { logError } from '../../../utils/log.js'
import type { DecisionResult } from './DecisionResult.js'
import type { ChainState, PermissionEvaluator } from './types.js'
import type { PermissionUpdate } from '../../../types/permissions.js'
import {
  applyPermissionUpdate,
  applyPermissionUpdates,
  persistPermissionUpdates,
} from '../PermissionUpdate.js'

/**
 * Evaluator that handles headless/async agent permission requests.
 * When permission prompts should be avoided, runs PermissionRequest hooks
 * first, then auto-denies if no hook provides a decision.
 */
export const headlessEvaluator: PermissionEvaluator = {
  name: 'headless',
  async evaluate(
    tool: Tool,
    input: Record<string, unknown>,
    context: ToolUseContext,
    chainState: ChainState,
  ): Promise<DecisionResult | null> {
    const appState = context.getAppState()
    if (!appState.toolPermissionContext.shouldAvoidPermissionPrompts) {
      return null
    }

    // Only applies to 'ask' verdicts
    const toolResult = chainState.toolPermissionResult
    if (toolResult?.behavior !== 'ask') {
      return null
    }

    const suggestions = 'suggestions' in toolResult ? toolResult.suggestions : undefined
    const mode = appState.toolPermissionContext.mode

    // Run PermissionRequest hooks
    const hookDecision = await runPermissionRequestHooksForHeadlessAgent(
      tool,
      input,
      '', // toolUseID not available in this context
      context,
      mode,
      suggestions as PermissionUpdate[] | undefined,
    )
    if (hookDecision) {
      return hookDecision
    }

    // Auto-deny
    return {
      verdict: 'deny',
      reason: 'Permission prompts are not available in this context',
      metadata: { evaluatorName: 'headless', reasonType: 'asyncAgent' },
    }
  },
}

async function runPermissionRequestHooksForHeadlessAgent(
  tool: Tool,
  input: { [key: string]: unknown },
  toolUseID: string,
  context: ToolUseContext,
  permissionMode: string | undefined,
  suggestions: PermissionUpdate[] | undefined,
): Promise<DecisionResult | null> {
  try {
    for await (const hookResult of executePermissionRequestHooks(
      tool.name,
      toolUseID,
      input,
      context,
      permissionMode,
      suggestions,
      context.abortController.signal,
    )) {
      if (!hookResult.permissionRequestResult) {
        continue
      }
      const decision = hookResult.permissionRequestResult
      if (decision.behavior === 'allow') {
        const finalInput = decision.updatedInput ?? input
        if (decision.updatedPermissions?.length) {
          persistPermissionUpdates(decision.updatedPermissions)
          context.setAppState(prev => ({
            ...prev,
            toolPermissionContext: applyPermissionUpdates(
              (prev as any).toolPermissionContext,
              decision.updatedPermissions!,
            ),
          }))
        }
        return {
          verdict: 'allow',
          updatedInput: finalInput,
          metadata: { evaluatorName: 'headless', reasonType: 'hook' },
        }
      }
      if (decision.behavior === 'deny') {
        if (decision.interrupt) {
          context.abortController.abort()
        }
        return {
          verdict: 'deny',
          reason: decision.message || 'Permission denied by hook',
          metadata: { evaluatorName: 'headless', reasonType: 'hook' },
        }
      }
    }
  } catch (error) {
    logError(
      new Error('PermissionRequest hook failed for headless agent', {
        cause: toError(error),
      }),
    )
  }
  return null
}
