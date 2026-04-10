import type {
  PendingClassifierCheck,
  PermissionDecisionReason,
  PermissionRule,
  PermissionUpdate,
} from '../../../types/permissions.js'

/**
 * Unified verdict returned by every evaluator in the chain.
 */
export type Verdict = 'allow' | 'deny' | 'ask' | 'pass'

/**
 * Structured metadata attached to a decision result.
 */
export interface DecisionMetadata {
  /** Which evaluator produced this result */
  evaluatorName?: string
  /** Structured reason type for analytics */
  reasonType?: PermissionDecisionReason['type']
  /** The mode that influenced this decision (if applicable) */
  mode?: string
  /** Original rule that triggered this (for rule decisions) */
  rule?: PermissionRule
  /** Safety check: whether auto mode classifier can evaluate */
  classifierApprovable?: boolean
  /** Set when an allow classifier should run async */
  pendingClassifierCheck?: PendingClassifierCheck
}

/**
 * Decision result from an evaluator.
 * `verdict === 'pass'` means the evaluator has no opinion and the chain should continue.
 */
export interface DecisionResult {
  verdict: Verdict
  /** Human-readable reason, shown to user on ask/deny */
  reason?: string
  /** Structured metadata for downstream processing */
  metadata?: DecisionMetadata
  /** If 'allow', possibly-transformed tool input */
  updatedInput?: Record<string, unknown>
  /** Permission update suggestions shown in the dialog */
  suggestions?: PermissionUpdate[]
  /** Blocked path for safety check decisions */
  blockedPath?: string
}

/**
 * Helper: create an allow decision.
 */
export function allowResult(
  evaluatorName: string,
  updatedInput?: Record<string, unknown>,
): DecisionResult {
  return {
    verdict: 'allow',
    updatedInput,
    metadata: { evaluatorName },
  }
}

/**
 * Helper: create a deny decision.
 */
export function denyResult(
  evaluatorName: string,
  reason: string,
  rule?: PermissionRule,
): DecisionResult {
  return {
    verdict: 'deny',
    reason,
    metadata: { evaluatorName, rule, reasonType: 'rule' },
  }
}

/**
 * Helper: create an ask decision.
 */
export function askResult(
  evaluatorName: string,
  reason: string,
  rule?: PermissionRule,
): DecisionResult {
  return {
    verdict: 'ask',
    reason,
    metadata: { evaluatorName, rule, reasonType: 'rule' },
  }
}

/**
 * Helper: create a pass (no opinion) result.
 */
export function passResult(evaluatorName: string): DecisionResult {
  return {
    verdict: 'pass',
    metadata: { evaluatorName },
  }
}
