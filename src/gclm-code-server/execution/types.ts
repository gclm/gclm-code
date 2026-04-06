import type { SessionRecord } from '../sessions/types.js'

export type ExecutionSubmitInput = {
  session: SessionRecord
  prompt: string
  requestId: string
}

export type ExecutionPermissionDecision =
  | {
      behavior: 'allow'
      updatedInput?: Record<string, unknown>
      resolvedBy?: string
    }
  | {
      behavior: 'deny'
      message: string
      resolvedBy?: string
    }

export interface SessionExecutionBridge {
  submitInput(input: ExecutionSubmitInput): Promise<void>
  interrupt(session: SessionRecord): Promise<boolean>
  resolvePermission(
    session: SessionRecord,
    requestId: string,
    decision: ExecutionPermissionDecision,
  ): Promise<boolean>
}
