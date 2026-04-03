import axios from 'axios'
import isEqual from 'lodash-es/isEqual.js'
import { getCodexOAuthTokens, getAnthropicApiKey } from '../../utils/auth.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'
import { logForDebugging } from '../../utils/debug.js'
import { getAPIProvider } from '../../utils/model/providers.js'
import { isEssentialTrafficOnly } from '../../utils/privacyLevel.js'
import type { ModelOption } from '../../utils/model/modelOptions.js'

const DEFAULT_OPENAI_MODELS_BASE_URL = 'https://api.openai.com/v1'
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

function getModelsBaseUrl(): string {
  const raw =
    process.env.OPENAI_BASE_URL ||
    process.env.ANTHROPIC_BASE_URL ||
    DEFAULT_OPENAI_MODELS_BASE_URL
  return raw.endsWith('/') ? raw.slice(0, -1) : raw
}

function getAuthHeaders(): Record<string, string> | null {
  if (process.env.OPENAI_API_KEY) {
    return { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` }
  }

  const codexTokens = getCodexOAuthTokens()
  if (codexTokens?.accessToken) {
    return { Authorization: `Bearer ${codexTokens.accessToken}` }
  }

  const apiKey = getAnthropicApiKey()
  if (apiKey) {
    return { Authorization: `Bearer ${apiKey}` }
  }

  return null
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
    description: 'Discovered via /models',
  }))
}

export async function refreshProviderModelOptions(
  force = false,
): Promise<void> {
  if (isEssentialTrafficOnly()) {
    return
  }
  if (getAPIProvider() !== 'openai') {
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

  const authHeaders = getAuthHeaders()
  if (!authHeaders) {
    logForDebugging('[ProviderModels] skipped: no auth header source')
    return
  }

  const endpoint = `${getModelsBaseUrl()}/models`

  try {
    const response = await axios.get<unknown>(endpoint, {
      headers: {
        ...authHeaders,
        'Content-Type': 'application/json',
      },
      timeout: 5000,
    })

    const modelIds = extractModelIds(response.data)
    if (modelIds.length === 0) {
      logForDebugging('[ProviderModels] no model ids found in /models response')
      return
    }

    const additionalModelOptions = toModelOptions(modelIds)
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
      `[ProviderModels] refreshed ${additionalModelOptions.length} models from ${endpoint}`,
    )
  } catch (error) {
    logForDebugging(
      `[ProviderModels] refresh failed: ${axios.isAxiosError(error) ? (error.response?.status ?? error.code) : 'unknown'}`,
    )
  }
}

export function startProviderModelDiscovery(): void {
  void refreshProviderModelOptions()
  const interval = setInterval(() => {
    void refreshProviderModelOptions()
  }, REFRESH_INTERVAL_MS)
  interval.unref()
}
