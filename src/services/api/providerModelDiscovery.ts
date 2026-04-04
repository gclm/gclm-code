import axios from 'axios'
import isEqual from 'lodash-es/isEqual.js'
import { getAuthHeaders } from '../../utils/http.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { logForDebugging } from '../../utils/debug.js'
import { getAPIProvider } from '../../utils/model/providers.js'
import { isEssentialTrafficOnly } from '../../utils/privacyLevel.js'
import type { ModelOption } from '../../utils/model/modelOptions.js'

const DEFAULT_REFRESH_TTL_MS = 10 * 60 * 1000
const REFRESH_INTERVAL_MS = 30 * 60 * 1000

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

function getCandidateModelEndpoints(baseUrl: string): string[] {
  return [
    `${baseUrl}/models`,
    `${baseUrl}/v1/models`,
  ]
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

function toModelOptions(modelIds: string[]): ModelOption[] {
  const unique = [...new Set(modelIds)].slice(0, 200)
  return unique.map(id => ({
    value: id,
    label: id,
    description: 'Discovered via gateway /models',
  }))
}

async function fetchModelsFromGateway(
  endpoints: string[],
  headers: Record<string, string>,
): Promise<{ endpoint: string; modelIds: string[] } | null> {
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

      logForDebugging(
        `[ProviderModels] endpoint responded but no model ids: ${endpoint}`,
      )
    } catch (error) {
      logForDebugging(
        `[ProviderModels] endpoint failed: ${endpoint} (${axios.isAxiosError(error) ? (error.response?.status ?? error.code) : 'unknown'})`,
      )
    }
  }

  return null
}

export async function refreshProviderModelOptions(
  force = false,
): Promise<void> {
  if (isEssentialTrafficOnly()) {
    return
  }

  // Gateway-first: provider aggregation lives in the gateway behind ANTHROPIC_BASE_URL.
  // We keep first-party untouched and avoid client-side provider protocol switching.
  if (getAPIProvider() === 'firstParty') {
    return
  }

  const gatewayBaseUrl = getGatewayBaseUrl()
  if (!gatewayBaseUrl) {
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

  const authResult = getAuthHeaders()
  if (authResult.error) {
    logForDebugging(`[ProviderModels] skipped: ${authResult.error}`)
    return
  }

  const endpoints = getCandidateModelEndpoints(gatewayBaseUrl)
  const fetched = await fetchModelsFromGateway(endpoints, authResult.headers)

  if (!fetched) {
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
      }
    }

    return {
      ...current,
      additionalModelOptionsCache: additionalModelOptions,
      additionalModelOptionsCacheFetchedAt: now,
    }
  })

  logForDebugging(
    `[ProviderModels] refreshed ${additionalModelOptions.length} models from ${fetched.endpoint}`,
  )
}

export function startProviderModelDiscovery(): void {
  void refreshProviderModelOptions()
  const interval = setInterval(() => {
    void refreshProviderModelOptions()
  }, REFRESH_INTERVAL_MS)
  interval.unref()
}
