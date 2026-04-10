import { feature } from 'bun:bundle'
import { APIUserAbortError } from '@anthropic-ai/sdk'
import type { Tool, ToolUseContext, AssistantMessage } from '../../../Tool.js'
import { AGENT_TOOL_NAME } from '../../../tools/AgentTool/constants.js'
import { REPL_TOOL_NAME } from '../../../tools/REPLTool/constants.js'
import { POWERSHELL_TOOL_NAME } from '../../../tools/PowerShellTool/toolName.js'
import { AbortError } from '../../../utils/errors.js'
import { logForDebugging } from '../../../utils/debug.js'
import {
  createDenialTrackingState,
  recordDenial,
  recordSuccess,
  shouldFallbackToPrompting,
} from '../denialTracking.js'
import {
  classifyYoloAction,
  formatActionForClassifier,
} from '../yoloClassifier.js'
import {
  setClassifierChecking,
  clearClassifierChecking,
} from '../../../utils/classifierApprovals.js'
import type { DecisionResult } from './DecisionResult.js'
import type { ChainState, PermissionEvaluator } from './types.js'
import type { YoloClassifierResult } from '../../../types/permissions.js'

/**
 * Evaluator that handles auto mode logic when the core chain returns 'ask'.
 * Replaces the ~300 lines of embedded auto mode code in the outer wrapper.
 *
 * Handles:
 * - Safety check immunity (non-classifierApprovable)
 * - User interaction requirement
 * - PowerShell guard (unless POWERSHELL_AUTO_MODE)
 * - acceptEdits fast-path
 * - Allowlist fast-path
 * - Classifier call with full error handling
 * - Denial tracking and limit handling
 */
export function createAutoModeEvaluator(
  assistantMessage: AssistantMessage,
): PermissionEvaluator {
  return {
    name: 'autoMode',
    async evaluate(
      tool: Tool,
      input: Record<string, unknown>,
      context: ToolUseContext,
      chainState: ChainState,
    ): Promise<DecisionResult | null> {
      // This evaluator only fires when the core chain would return 'ask'.
      // It inspects the toolPermissionResult and decides whether to run
      // the classifier or let the ask pass through.

      const toolResult = chainState.toolPermissionResult
      if (!toolResult || toolResult.behavior !== 'ask') {
        return null
      }

      const appState = context.getAppState()
      const mode = appState.toolPermissionContext.mode
      const isInAutoMode =
        mode === 'auto' ||
        (mode === 'plan' && isAutoModeActive())

      if (!isInAutoMode) {
        return null
      }

      // Safety check immunity: non-classifierApprovable safetyChecks stay immune
      if (
        toolResult.decisionReason?.type === 'safetyCheck' &&
        !toolResult.decisionReason.classifierApprovable
      ) {
        if (appState.toolPermissionContext.shouldAvoidPermissionPrompts) {
          return {
            verdict: 'deny',
            reason: 'Safety check requires interactive approval and permission prompts are not available in this context',
            metadata: { evaluatorName: 'autoMode', reasonType: 'asyncAgent' },
          }
        }
        return null
      }

      if (tool.requiresUserInteraction?.()) {
        return null
      }

      const denialState =
        context.localDenialTracking ??
        appState.denialTracking ??
        createDenialTrackingState()

      // PowerShell guard
      if (tool.name === POWERSHELL_TOOL_NAME && !feature('POWERSHELL_AUTO_MODE')) {
        if (appState.toolPermissionContext.shouldAvoidPermissionPrompts) {
          return {
            verdict: 'deny',
            reason: 'PowerShell tool requires interactive approval',
            metadata: { evaluatorName: 'autoMode', reasonType: 'asyncAgent' },
          }
        }
        logForDebugging(
          `Skipping auto mode classifier for ${tool.name}: tool requires explicit user permission`,
        )
        return null
      }

      // acceptEdits fast-path
      if (tool.name !== AGENT_TOOL_NAME && tool.name !== REPL_TOOL_NAME) {
        try {
          const parsedInput = tool.inputSchema.parse(input)
          const acceptEditsResult = await tool.checkPermissions(parsedInput, {
            ...context,
            getAppState: () => {
              const state = context.getAppState()
              return {
                ...state,
                toolPermissionContext: {
                  ...state.toolPermissionContext,
                  mode: 'acceptEdits' as const,
                },
              }
            },
          })
          if (acceptEditsResult.behavior === 'allow') {
            const newDenialState = recordSuccess(denialState)
            persistDenialState(context, newDenialState)
            logForDebugging(
              `Skipping auto mode classifier for ${tool.name}: would be allowed in acceptEdits mode`,
            )
            return {
              verdict: 'allow',
              updatedInput: acceptEditsResult.updatedInput ?? input,
              metadata: { evaluatorName: 'autoMode', reasonType: 'mode', mode: 'auto' },
            }
          }
        } catch (e) {
          if (e instanceof AbortError || e instanceof APIUserAbortError) {
            throw e
          }
        }
      }

      // Allowlist fast-path
      const classifierDecisionModule = getClassifierDecisionModule()
      if (classifierDecisionModule?.isAutoModeAllowlistedTool(tool.name)) {
        const newDenialState = recordSuccess(denialState)
        persistDenialState(context, newDenialState)
        logForDebugging(
          `Skipping auto mode classifier for ${tool.name}: tool is on the safe allowlist`,
        )
        return {
          verdict: 'allow',
          updatedInput: input,
          metadata: { evaluatorName: 'autoMode', reasonType: 'mode', mode: 'auto' },
        }
      }

      // Run the classifier
      const action = formatActionForClassifier(tool.name, input)
      const toolUseID = (input as any).tool_use_id ?? ''
      setClassifierChecking(toolUseID)
      let classifierResult: YoloClassifierResult
      try {
        classifierResult = await classifyYoloAction(
          context.messages,
          action,
          context.options.tools,
          appState.toolPermissionContext,
          context.abortController.signal,
        )
      } finally {
        clearClassifierChecking(toolUseID)
      }

      // Error dump notification
      if (
        classifierResult.errorDumpPath &&
        context.addNotification
      ) {
        context.addNotification({
          key: 'auto-mode-error-dump',
          text: `Auto mode classifier error — prompts dumped to ${classifierResult.errorDumpPath} (included in /share)`,
          priority: 'immediate',
          color: 'error',
        })
      }

      if (classifierResult.shouldBlock) {
        // Transcript too long
        if (classifierResult.transcriptTooLong) {
          if (appState.toolPermissionContext.shouldAvoidPermissionPrompts) {
            throw new AbortError(
              'Agent aborted: auto mode classifier transcript exceeded context window in headless mode',
            )
          }
          logForDebugging(
            'Auto mode classifier transcript too long, falling back to normal permission handling',
            { level: 'warn' },
          )
          return null
        }

        // Classifier unavailable
        if (classifierResult.unavailable) {
          if (
            true) {
            return {
              verdict: 'deny',
              reason: 'Classifier unavailable',
              metadata: { evaluatorName: 'autoMode', reasonType: 'classifier' },
            }
          }
          // Fail open
          logForDebugging(
            'Auto mode classifier unavailable, falling back to normal permission handling (fail open)',
            { level: 'warn' },
          )
          return null
        }

        // Classifier blocked the action
        const newDenialState = recordDenial(denialState)
        persistDenialState(context, newDenialState)

        logForDebugging(
          `Auto mode classifier blocked action: ${classifierResult.reason}`,
          { level: 'warn' },
        )

        if (shouldFallbackToPrompting(newDenialState)) {
          // Denial limit hit — fall back to prompting
          const hitTotalLimit = newDenialState.totalDenials >= 10
          const totalCount = newDenialState.totalDenials
          const consecutiveCount = newDenialState.consecutiveDenials
          const warning = hitTotalLimit
            ? `${totalCount} actions were blocked this session. Please review the transcript before continuing.`
            : `${consecutiveCount} consecutive actions were blocked. Please review the transcript before continuing.`

          if (appState.toolPermissionContext.shouldAvoidPermissionPrompts) {
            throw new AbortError(
              'Agent aborted: too many classifier denials in headless mode',
            )
          }

          if (hitTotalLimit) {
            persistDenialState(context, {
              ...newDenialState,
              totalDenials: 0,
              consecutiveDenials: 0,
            })
          }

          return {
            verdict: 'ask',
            reason: `${warning}\n\nLatest blocked action: ${classifierResult.reason}`,
            metadata: {
              evaluatorName: 'autoMode',
              reasonType: 'classifier',
            },
          }
        }

        return {
          verdict: 'deny',
          reason: classifierResult.reason,
          metadata: {
            evaluatorName: 'autoMode',
            reasonType: 'classifier',
          },
        }
      }

      // Classifier allowed the action
      const newDenialState = recordSuccess(denialState)
      persistDenialState(context, newDenialState)

      return {
        verdict: 'allow',
        updatedInput: input,
        metadata: {
          evaluatorName: 'autoMode',
          reasonType: 'classifier',
        },
      }
    },
  }
}

function isAutoModeActive(): boolean {
  const autoModeStateModule = feature('TRANSCRIPT_CLASSIFIER')
    ? require('../autoModeState.js') as typeof import('../autoModeState.js')
    : null
  return autoModeStateModule?.isAutoModeActive() ?? false
}

function getClassifierDecisionModule() {
  const classifierDecisionModule = feature('TRANSCRIPT_CLASSIFIER')
    ? require('../classifierDecision.js') as typeof import('../classifierDecision.js')
    : null
  return classifierDecisionModule
}

function persistDenialState(
  context: ToolUseContext,
  newState: import('../denialTracking.js').DenialTrackingState,
): void {
  if (context.localDenialTracking) {
    Object.assign(context.localDenialTracking, newState)
  } else {
    context.setAppState(prev => {
      if ((prev as any).denialTracking === newState) return prev
      return { ...(prev as object), denialTracking: newState }
    })
  }
}
