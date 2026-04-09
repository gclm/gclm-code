import type { FileEditFailure, Hello2ccSessionState } from './types.js'

const FILE_EDIT_TOOL_NAMES = new Set(['Edit', 'Write'])

const MAX_FILE_EDIT_FAILURES = 10

function extractFilePath(toolName: string, input: Record<string, unknown>): string | null {
  if (toolName === 'Edit' && typeof input.file_path === 'string') {
    return input.file_path
  }
  if (toolName === 'Write' && typeof input.file_path === 'string') {
    return input.file_path
  }
  return null
}

function classifyError(error: string): string {
  const lower = error.toLowerCase()
  if (lower.includes('permission') || lower.includes('eacces') || lower.includes('eperm')) {
    return 'permission'
  }
  if (lower.includes('enoent') || lower.includes('not found') || lower.includes('no such')) {
    return 'not_found'
  }
  if (lower.includes('edit') && (lower.includes('failed') || lower.includes('invalid'))) {
    return 'edit_invalid'
  }
  if (lower.includes('disk') || lower.includes('enospc') || lower.includes('full')) {
    return 'disk_full'
  }
  if (lower.includes('encoding') || lower.includes('invalid char')) {
    return 'encoding'
  }
  return 'other'
}

function makeSignature(filePath: string, errorType: string): string {
  return `file_edit:${filePath}:${errorType}`
}

function upsertFileEditFailure(
  failures: FileEditFailure[],
  filePath: string,
  errorType: string,
  error: string,
): FileEditFailure[] {
  const existingIndex = failures.findIndex(
    f => f.filePath === filePath && f.errorType === errorType,
  )
  const updatedAt = new Date().toISOString()

  if (existingIndex >= 0) {
    const updated = [...failures]
    updated[existingIndex] = {
      ...updated[existingIndex],
      count: updated[existingIndex].count + 1,
      lastError: error.slice(0, 200),
      updatedAt,
    }
    return updated
  }

  return [
    { filePath, errorType, count: 1, lastError: error.slice(0, 200), updatedAt },
    ...failures,
  ].slice(0, MAX_FILE_EDIT_FAILURES)
}

export function recordFileEditFailure(
  state: Hello2ccSessionState,
  toolName: string,
  input: Record<string, unknown>,
  error: string,
): Hello2ccSessionState | null {
  if (!FILE_EDIT_TOOL_NAMES.has(toolName)) return null

  const filePath = extractFilePath(toolName, input)
  if (!filePath) return null

  const errorType = classifyError(error)
  const nextState = {
    ...state,
    fileEditFailures: upsertFileEditFailure(
      state.fileEditFailures,
      filePath,
      errorType,
      error,
    ),
  }

  return nextState
}

export function getFileEditFailure(
  state: Hello2ccSessionState,
  toolName: string,
  input: Record<string, unknown>,
): FileEditFailure | null {
  if (!FILE_EDIT_TOOL_NAMES.has(toolName)) return null

  const filePath = extractFilePath(toolName, input)
  if (!filePath) return null

  return state.fileEditFailures.find(
    f => f.filePath === filePath,
  ) ?? null
}

export function shouldBlockFileEdit(
  state: Hello2ccSessionState,
  toolName: string,
  input: Record<string, unknown>,
): { blocked: boolean; reason?: string; note?: string } {
  const failure = getFileEditFailure(state, toolName, input)
  if (!failure) return { blocked: false }

  if (failure.count >= 3) {
    return {
      blocked: true,
      reason: `File ${failure.filePath} has failed ${failure.count} times (type: ${failure.errorType}). Stop retrying and try a different approach.`,
      note: `Blocked repeated edit on ${failure.filePath}. Suggest: read the file first, verify its current state, then use a different edit strategy.`,
    }
  }

  if (failure.count >= 2 && failure.errorType === 'permission') {
    return {
      blocked: true,
      reason: `File ${failure.filePath} has permission-denied ${failure.count} times. Check file ownership and write permissions before retrying.`,
      note: `Blocked permission retry on ${failure.filePath}. Suggest: run \`ls -la ${failure.filePath}\` to check ownership.`,
    }
  }

  return { blocked: false }
}

export function getFileEditRecoveryAdvice(state: Hello2ccSessionState): string[] {
  const advice: string[] = []
  const criticalFailures = state.fileEditFailures.filter(f => f.count >= 2)

  for (const failure of criticalFailures) {
    switch (failure.errorType) {
      case 'permission':
        advice.push(
          `${failure.filePath}: permission denied ${failure.count}x. Run \`ls -la ${failure.filePath}\` to check ownership, or use a different file.`,
        )
        break
      case 'not_found':
        advice.push(
          `${failure.filePath}: file not found ${failure.count}x. Verify the path is correct and the file exists before editing.`,
        )
        break
      case 'edit_invalid':
        advice.push(
          `${failure.filePath}: edit failed ${failure.count}x. Read the file first with FileRead to see its current content, then retry.`,
        )
        break
      case 'disk_full':
        advice.push(
          `${failure.filePath}: disk full ${failure.count}x. Free up disk space before continuing.`,
        )
        break
      default:
        advice.push(
          `${failure.filePath}: repeated failure (${failure.count}x, type: ${failure.errorType}). Read the file first and try a different approach.`,
        )
    }
  }

  return advice
}
