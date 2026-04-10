import type { GrowthBook } from '@growthbook/growthbook'
import { isEqual, memoize } from 'lodash-es'
import {
  getGlobalConfig,
  saveGlobalConfig,
} from '../../utils/config.js'
import { logError } from '../../utils/log.js'
import { createSignal } from '../../utils/signal.js'
import type { GitHubActionsMetadata } from '../../utils/user.js'

/**
 * User attributes kept for type compatibility with existing call sites.
 * The open build does not send these attributes to any remote service.
 */
export type GrowthBookUserAttributes = {
  id: string
  sessionId: string
  deviceID: string
  platform: 'win32' | 'darwin' | 'linux'
  apiBaseUrlHost?: string
  organizationUUID?: string
  accountUUID?: string
  userType?: string
  subscriptionType?: string
  rateLimitTier?: string
  firstTokenTime?: number
  email?: string
  appVersion?: string
  github?: GitHubActionsMetadata
}

type GrowthBookRefreshListener = () => void | Promise<void>

const refreshed = createSignal()
let envOverrides: Record<string, unknown> | null = null
let envOverridesParsed = false
let reinitializingPromise: Promise<unknown> | null = null

function callSafe(listener: GrowthBookRefreshListener): void {
  try {
    void Promise.resolve(listener()).catch(e => {
      logError(e)
    })
  } catch (e) {
    logError(e)
  }
}

function getEnvOverrides(): Record<string, unknown> | null {
  if (!envOverridesParsed) {
    envOverridesParsed = true
    const raw = process.env.CLAUDE_INTERNAL_FC_OVERRIDES
    if (raw) {
      try {
        envOverrides = JSON.parse(raw) as Record<string, unknown>
      } catch {
        logError(
          new Error(
            `GrowthBook: Failed to parse CLAUDE_INTERNAL_FC_OVERRIDES: ${raw}`,
          ),
        )
      }
    }
  }
  return envOverrides
}

function getConfigOverrides(): Record<string, unknown> | undefined {
  try {
    return getGlobalConfig().growthBookOverrides
  } catch {
    return undefined
  }
}

function getCachedFeatures(): Record<string, unknown> {
  try {
    return getGlobalConfig().cachedGrowthBookFeatures ?? {}
  } catch {
    return {}
  }
}

function getFeatureValueFromLocalCaches<T>(
  feature: string,
  defaultValue: T,
): T {
  const overrides = getEnvOverrides()
  if (overrides && feature in overrides) {
    return overrides[feature] as T
  }

  const configOverrides = getConfigOverrides()
  if (configOverrides && feature in configOverrides) {
    return configOverrides[feature] as T
  }

  const cached = getCachedFeatures()[feature]
  return cached !== undefined ? (cached as T) : defaultValue
}

export function onGrowthBookRefresh(
  listener: GrowthBookRefreshListener,
): () => void {
  const unsubscribe = refreshed.subscribe(() => callSafe(listener))
  queueMicrotask(() => {
    callSafe(listener)
  })
  return unsubscribe
}

export function hasGrowthBookEnvOverride(feature: string): boolean {
  const overrides = getEnvOverrides()
  return overrides !== null && feature in overrides
}

export function getAllGrowthBookFeatures(): Record<string, unknown> {
  return getCachedFeatures()
}

export function getGrowthBookConfigOverrides(): Record<string, unknown> {
  return getConfigOverrides() ?? {}
}

export function setGrowthBookConfigOverride(
  feature: string,
  value: unknown,
): void {
  try {
    saveGlobalConfig(c => {
      const current = c.growthBookOverrides ?? {}
      if (value === undefined) {
        if (!(feature in current)) return c
        const { [feature]: _, ...rest } = current
        if (Object.keys(rest).length === 0) {
          const { growthBookOverrides: __, ...configWithout } = c
          return configWithout
        }
        return { ...c, growthBookOverrides: rest }
      }
      if (isEqual(current[feature], value)) return c
      return { ...c, growthBookOverrides: { ...current, [feature]: value } }
    })
    refreshed.emit()
  } catch (e) {
    logError(e)
  }
}

export function clearGrowthBookConfigOverrides(): void {
  try {
    saveGlobalConfig(c => {
      if (
        !c.growthBookOverrides ||
        Object.keys(c.growthBookOverrides).length === 0
      ) {
        return c
      }
      const { growthBookOverrides: _, ...rest } = c
      return rest
    })
    refreshed.emit()
  } catch (e) {
    logError(e)
  }
}

export function getApiBaseUrlHost(): string | undefined {
  const baseUrl = process.env.ANTHROPIC_BASE_URL
  if (!baseUrl) return undefined
  try {
    const host = new URL(baseUrl).host
    if (host === 'api.anthropic.com') return undefined
    return host
  } catch {
    return undefined
  }
}

/**
 * Retained for API compatibility. The open build does not initialize
 * any remote GrowthBook client.
 */
export const initializeGrowthBook = memoize(
  async (): Promise<GrowthBook | null> => {
    return null
  },
)

export async function getFeatureValue_DEPRECATED<T>(
  feature: string,
  defaultValue: T,
): Promise<T> {
  return getFeatureValueFromLocalCaches(feature, defaultValue)
}

export function getFeatureValue_CACHED_MAY_BE_STALE<T>(
  feature: string,
  defaultValue: T,
): T {
  return getFeatureValueFromLocalCaches(feature, defaultValue)
}

export function getFeatureValue_CACHED_WITH_REFRESH<T>(
  feature: string,
  defaultValue: T,
  _refreshIntervalMs: number,
): T {
  return getFeatureValue_CACHED_MAY_BE_STALE(feature, defaultValue)
}

export function checkStatsigFeatureGate_CACHED_MAY_BE_STALE(
  gate: string,
): boolean {
  const overrides = getEnvOverrides()
  if (overrides && gate in overrides) {
    return Boolean(overrides[gate])
  }

  const configOverrides = getConfigOverrides()
  if (configOverrides && gate in configOverrides) {
    return Boolean(configOverrides[gate])
  }

  const config = getGlobalConfig()
  const gbCached = config.cachedGrowthBookFeatures?.[gate]
  if (gbCached !== undefined) {
    return Boolean(gbCached)
  }
  return config.cachedStatsigGates?.[gate] ?? false
}

export async function checkSecurityRestrictionGate(
  gate: string,
): Promise<boolean> {
  const overrides = getEnvOverrides()
  if (overrides && gate in overrides) {
    return Boolean(overrides[gate])
  }

  const configOverrides = getConfigOverrides()
  if (configOverrides && gate in configOverrides) {
    return Boolean(configOverrides[gate])
  }

  if (reinitializingPromise) {
    await reinitializingPromise
  }

  const config = getGlobalConfig()
  const statsigCached = config.cachedStatsigGates?.[gate]
  if (statsigCached !== undefined) {
    return Boolean(statsigCached)
  }

  const gbCached = config.cachedGrowthBookFeatures?.[gate]
  if (gbCached !== undefined) {
    return Boolean(gbCached)
  }

  return false
}

export async function checkGate_CACHED_OR_BLOCKING(
  gate: string,
): Promise<boolean> {
  return Boolean(getFeatureValueFromLocalCaches(gate, false))
}

export function refreshGrowthBookAfterAuthChange(): void {
  reinitializingPromise = initializeGrowthBook().finally(() => {
    reinitializingPromise = null
  })
  refreshed.emit()
}

export function resetGrowthBook(): void {
  reinitializingPromise = null
  initializeGrowthBook.cache?.clear?.()
  envOverrides = null
  envOverridesParsed = false
}

export async function refreshGrowthBookFeatures(): Promise<void> {
  refreshed.emit()
}

export function setupPeriodicGrowthBookRefresh(): void {
  // Intentionally no-op in open build (no remote config refresh).
}

export function stopPeriodicGrowthBookRefresh(): void {
  // Intentionally no-op in open build (no remote config refresh).
}

export async function getDynamicConfig_BLOCKS_ON_INIT<T>(
  configName: string,
  defaultValue: T,
): Promise<T> {
  return getFeatureValue_DEPRECATED(configName, defaultValue)
}

export function getDynamicConfig_CACHED_MAY_BE_STALE<T>(
  configName: string,
  defaultValue: T,
): T {
  return getFeatureValue_CACHED_MAY_BE_STALE(configName, defaultValue)
}
