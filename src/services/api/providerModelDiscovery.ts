import axios from 'axios'
import isEqual from 'lodash-es/isEqual.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { logForDebugging } from '../../utils/debug.js'
import { isEssentialTrafficOnly } from '../../utils/privacyLevel.js'
import type { ModelOption } from '../../utils/model/modelOptions.js'

const DEFAULT_REFRESH_TTL_MS = 10 * 60 * 1000
const REFRESH_INTERVAL_MS = 30 * 60 * 1000

export type ProviderModelDiscoveryErrorType =
  | 'auth'
  | 'not_found'
  | 'rate_limit'
  | 'gateway_unavailable'
  | 'empty_models'
  | 'invalid_payload'
  | 'unknown'

export class ProviderModelDiscoveryError extends Error {
  readonly type: ProviderModelDiscoveryErrorType
  readonly endpoint?: string
  readonly statusCode?: number

  constructor(
    message: string,
    options: {
      type: ProviderModelDiscoveryErrorType
      endpoint?: string
      statusCode?: number
    },
  ) {
    super(message)
    this.name = 'ProviderModelDiscoveryError'
    this.type = options.type
    this.endpoint = options.endpoint
    this.statusCode = options.statusCode
  }
}

type RefreshOptions = {
  force?: boolean
  interactive?: boolean
}

type FetchFailure = {
  endpoint: string
  statusCode?: number
  code?: string
  error?: unknown
}

function getRefreshTtlMs(): number {
  const raw = process.env.CLAUDE_CODE_PROVIDER_MODELS_TTL_MS
  if (!raw) {
    return DEFAULT_REFRESH_TTL_MS
  }
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_REFRESH_TTL_MS
}

function trimTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

function getGatewayBaseUrl(): string | null {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  if (!baseUrl) return null
  return trimTrailingSlash(baseUrl)
}

function getGatewayAuthHeaders():
  | { headers: Record<string, string> }
  | { error: string } {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) {
    return {
      error:
        'ANTHROPIC_API_KEY is not set. Configure gateway API key first.',
    }
  }

  return {
    headers: {
      'x-api-key': apiKey,
    },
  }
}

function getPathname(baseUrl: string): string {
  try {
    return new URL(baseUrl).pathname || ''
  } catch {
    const schemeSep = baseUrl.indexOf('://')
    const hostStart = schemeSep >= 0 ? schemeSep + 3 : 0
    const pathStart = baseUrl.indexOf('/', hostStart)
    return pathStart >= 0 ? baseUrl.slice(pathStart) : ''
  }
}

function getCandidateModelEndpoints(baseUrl: string): string[] {
  const normalized = trimTrailingSlash(baseUrl)
  const pathname = getPathname(normalized).replace(/\/+$/, '')

  // Gateway endpoint mapping rule:
  // - base URL ending with /vN      => append /models
  // - other base URL forms          => append /v1/models
  if (/^\/v\d+$/.test(pathname)) {
    return [`${normalized}/models`]
  }

  return [`${normalized}/v1/models`]
}

function getStringField(
  value: Record<string, unknown>,
  candidates: string[],
): string | null {
  for (const key of candidates) {
    const field = value[key]
    if (typeof field === 'string' && field.trim().length > 0) {
      return field.trim()
    }
  }
  return null
}

function extractModelIds(payload: unknown): string[] {
  const listFrom = (items: unknown[]): string[] =>
    items
      .map(item => {
        if (typeof item === 'string') {
          return item.trim()
        }
        if (item && typeof item === 'object') {
          return getStringField(item as Record<string, unknown>, [
            'id',
            'model',
            'name',
          ])
        }
        return null
      })
      .filter((id): id is string => !!id)

  if (Array.isArray(payload)) {
    return listFrom(payload)
  }

  if (!payload || typeof payload !== 'object') {
    return []
  }

  const record = payload as Record<string, unknown>
  if (Array.isArray(record.data)) {
    return listFrom(record.data)
  }

  if (Array.isArray(record.models)) {
    return listFrom(record.models)
  }

  return []
}

function hasRecognizedModelListShape(payload: unknown): boolean {
  if (Array.isArray(payload)) {
    return true
  }
  if (!payload || typeof payload !== 'object') {
    return false
  }
  const record = payload as Record<string, unknown>
  return Array.isArray(record.data) || Array.isArray(record.models)
}

function toModelOptions(modelIds: string[]): ModelOption[] {
  const unique = [...new Set(modelIds)].slice(0, 200)
  return unique.map(id => ({
    value: id,
    label: id,
    description: 'Discovered via gateway /models',
  }))
}

function toCompactMessage(message: string): string {
  const compact = message.trim()
  return compact.length > 240 ? `${compact.slice(0, 237)}...` : compact
}

function recordProviderModelDiscoveryStatus(status: {
  state: 'success' | 'error'
  timestamp: number
  endpoint?: string
  errorType?: ProviderModelDiscoveryErrorType
  statusCode?: number
  message?: string
  discoveredModelCount?: number
}): void {
  saveGlobalConfig(current => ({
    ...current,
    providerModelDiscoveryLastStatus: {
      ...status,
      message: status.message ? toCompactMessage(status.message) : undefined,
    },
  }))
}

function mapFailureToDiscoveryError(
  failure: FetchFailure,
): ProviderModelDiscoveryError {
  const status = failure.statusCode

  if (status === 401 || status === 403) {
    return new ProviderModelDiscoveryError(
      'Gateway authentication failed (401/403). Check ANTHROPIC_API_KEY and gateway permission settings.',
      {
        type: 'auth',
        endpoint: failure.endpoint,
        statusCode: status,
      },
    )
  }

  if (status === 404) {
    return new ProviderModelDiscoveryError(
      'Gateway /models endpoint returned 404. Check ANTHROPIC_BASE_URL path mapping: host -> /v1/models, host/vN -> /models.',
      {
        type: 'not_found',
        endpoint: failure.endpoint,
        statusCode: status,
      },
    )
  }

  if (status === 429) {
    return new ProviderModelDiscoveryError(
      'Gateway rate limit reached while discovering models (429). Retry later or increase gateway quota.',
      {
        type: 'rate_limit',
        endpoint: failure.endpoint,
        statusCode: status,
      },
    )
  }

  if (typeof status === 'number' && status >= 500) {
    return new ProviderModelDiscoveryError(
      'Gateway is unavailable while discovering models (5xx). Check gateway health and upstream status.',
      {
        type: 'gateway_unavailable',
        endpoint: failure.endpoint,
        statusCode: status,
      },
    )
  }

  if (
    failure.code &&
    ['ECONNABORTED', 'ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND'].includes(
      failure.code,
    )
  ) {
    return new ProviderModelDiscoveryError(
      `Gateway request failed (${failure.code}). Check ANTHROPIC_BASE_URL reachability and network connectivity.`,
      {
        type: 'gateway_unavailable',
        endpoint: failure.endpoint,
      },
    )
  }

  return new ProviderModelDiscoveryError(
    'Gateway model discovery failed. Check ANTHROPIC_BASE_URL and gateway availability.',
    {
      type: 'unknown',
      endpoint: failure.endpoint,
      statusCode: status,
    },
  )
}

async function fetchModelsFromGateway(
  endpoints: string[],
  headers: Record<string, string>,
): Promise<{ endpoint: string; modelIds: string[] } | null> {
  let lastFailure: FetchFailure | null = null

  for (const endpoint of endpoints) {
    try {
      const response = await axios.get<unknown>(endpoint, {
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        timeout: 5000,
      })

      const modelIds = extractModelIds(response.data)
      if (modelIds.length > 0) {
        return { endpoint, modelIds }
      }

      if (!hasRecognizedModelListShape(response.data)) {
        throw new ProviderModelDiscoveryError(
          'Gateway /models returned an unexpected payload shape. Expected array, {data: []}, or {models: []}.',
          {
            type: 'invalid_payload',
            endpoint,
          },
        )
      }

      throw new ProviderModelDiscoveryError(
        'Gateway /models responded successfully but returned no models.',
        {
          type: 'empty_models',
          endpoint,
        },
      )
    } catch (error) {
      if (error instanceof ProviderModelDiscoveryError) {
        throw error
      }

      if (axios.isAxiosError(error)) {
        const statusCode = error.response?.status
        const code = typeof error.code === 'string' ? error.code : undefined
        const failure: FetchFailure = {
          endpoint,
          statusCode,
          code,
          error,
        }
        lastFailure = failure
        logForDebugging(
          `[ProviderModels] endpoint failed: ${endpoint} (${statusCode ?? code ?? 'unknown'})`,
        )
        continue
      }

      lastFailure = { endpoint, error }
      logForDebugging(`[ProviderModels] endpoint failed: ${endpoint} (unknown)`)
    }
  }

  if (lastFailure) {
    throw mapFailureToDiscoveryError(lastFailure)
  }

  return null
}

function toDiscoveryError(error: unknown): ProviderModelDiscoveryError {
  if (error instanceof ProviderModelDiscoveryError) {
    return error
  }

  if (error instanceof Error) {
    return new ProviderModelDiscoveryError(error.message, { type: 'unknown' })
  }

  return new ProviderModelDiscoveryError('Unknown model discovery failure', {
    type: 'unknown',
  })
}

export async function refreshProviderModelOptions(
  forceOrOptions: boolean | RefreshOptions = false,
): Promise<void> {
  const options: RefreshOptions =
    typeof forceOrOptions === 'boolean' ? { force: forceOrOptions } : forceOrOptions

  const force = options.force ?? false
  const interactive = options.interactive ?? false

  // Respect the privacy gate for background refreshes, but allow explicit
  // user-driven actions like /model and gateway setup to fetch fresh models.
  if (!interactive && isEssentialTrafficOnly()) {
    return
  }

  // Gateway-first: discovery is driven by ANTHROPIC_BASE_URL instead of provider flags.
  // We intentionally do not gate this behind getAPIProvider() so the new platform
  // setup path (which clears provider flags) can still refresh models immediately.

  const gatewayBaseUrl = getGatewayBaseUrl()
  if (!gatewayBaseUrl) {
    const error = new ProviderModelDiscoveryError(
      'ANTHROPIC_BASE_URL is not set. Configure gateway base URL first.',
      {
        type: 'gateway_unavailable',
      },
    )

    recordProviderModelDiscoveryStatus({
      state: 'error',
      timestamp: Date.now(),
      errorType: error.type,
      message: error.message,
    })

    if (interactive) {
      throw error
    }
    logForDebugging('[ProviderModels] skipped: ANTHROPIC_BASE_URL not set')
    return
  }

  const config = getGlobalConfig()
  const now = Date.now()
  const ttl = getRefreshTtlMs()
  const fetchedAt = config.additionalModelOptionsCacheFetchedAt ?? 0

  if (!force && fetchedAt > 0 && now - fetchedAt < ttl) {
    logForDebugging('[ProviderModels] skipped: cache still fresh')
    return
  }

  const authResult = getGatewayAuthHeaders()
  if (authResult.error) {
    const error = new ProviderModelDiscoveryError(authResult.error, {
      type: 'auth',
    })

    recordProviderModelDiscoveryStatus({
      state: 'error',
      timestamp: now,
      errorType: error.type,
      message: error.message,
    })

    if (interactive) {
      throw error
    }

    logForDebugging(`[ProviderModels] skipped: ${authResult.error}`)
    return
  }

  const endpoints = getCandidateModelEndpoints(gatewayBaseUrl)

  try {
    const fetched = await fetchModelsFromGateway(endpoints, authResult.headers)

    if (!fetched) {
      const error = new ProviderModelDiscoveryError(
        'Gateway model discovery failed: no candidate endpoints available.',
        {
          type: 'unknown',
        },
      )

      recordProviderModelDiscoveryStatus({
        state: 'error',
        timestamp: now,
        errorType: error.type,
        message: error.message,
      })

      if (interactive) {
        throw error
      }

      logForDebugging('[ProviderModels] all gateway /models endpoints failed')
      return
    }

    const additionalModelOptions = toModelOptions(fetched.modelIds)
    saveGlobalConfig(current => {
      const unchanged = isEqual(
        current.additionalModelOptionsCache,
        additionalModelOptions,
      )
      if (unchanged) {
        return {
          ...current,
          additionalModelOptionsCacheFetchedAt: now,
          providerModelDiscoveryLastStatus: {
            state: 'success',
            timestamp: now,
            endpoint: fetched.endpoint,
            discoveredModelCount: additionalModelOptions.length,
          },
        }
      }

      return {
        ...current,
        additionalModelOptionsCache: additionalModelOptions,
        additionalModelOptionsCacheFetchedAt: now,
        providerModelDiscoveryLastStatus: {
          state: 'success',
          timestamp: now,
          endpoint: fetched.endpoint,
          discoveredModelCount: additionalModelOptions.length,
        },
      }
    })

    logForDebugging(
      `[ProviderModels] refreshed ${additionalModelOptions.length} models from ${fetched.endpoint}`,
    )
  } catch (error) {
    const mapped = toDiscoveryError(error)
    const detail =
      mapped.statusCode !== undefined
        ? `${mapped.type}, status=${mapped.statusCode}`
        : mapped.type

    recordProviderModelDiscoveryStatus({
      state: 'error',
      timestamp: now,
      endpoint: mapped.endpoint,
      errorType: mapped.type,
      statusCode: mapped.statusCode,
      message: mapped.message,
    })

    logForDebugging(`[ProviderModels] model discovery failed: ${detail}`)

    if (interactive) {
      throw mapped
    }
  }
}

export function startProviderModelDiscovery(): void {
  void refreshProviderModelOptions()
  const interval = setInterval(() => {
    void refreshProviderModelOptions()
  }, REFRESH_INTERVAL_MS)
  interval.unref()
}
