export type UnifiedSuccessResponse<T> = {
  ok: true
  data: T
  timestamp: string
}

export type UnifiedErrorResponse = {
  ok: false
  error: {
    code: string
    message: string
    requestId?: string
    details?: unknown
  }
  timestamp: string
}

export type UnifiedResponse<T> = UnifiedSuccessResponse<T> | UnifiedErrorResponse

export function success<T>(data: T): UnifiedSuccessResponse<T> {
  return {
    ok: true,
    data,
    timestamp: new Date().toISOString(),
  }
}

export function error(
  code: string,
  message: string,
  options?: {
    requestId?: string
    details?: unknown
  },
): UnifiedErrorResponse {
  return {
    ok: false,
    error: {
      code,
      message,
      ...(options?.requestId ? { requestId: options.requestId } : {}),
      ...(options?.details ? { details: options.details } : {}),
    },
    timestamp: new Date().toISOString(),
  }
}
