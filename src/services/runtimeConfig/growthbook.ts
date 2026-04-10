/**
 * Feature flag stub module.
 *
 * All GrowthBook remote functionality has been removed from this build.
 * Every function returns its default value immediately — no network calls,
 * no disk caches, no refresh signals.
 *
 * Callers across the codebase still import from this module for backward
 * compatibility. The TypeScript types are preserved so existing code
 * compiles without modification.
 */

// ── Feature value getters (always return defaultValue) ──

export function getFeatureValue_CACHED_MAY_BE_STALE<T>(
  _feature: string,
  defaultValue: T,
): T {
  return defaultValue
}

export function getFeatureValue_CACHED_WITH_REFRESH<T>(
  _feature: string,
  defaultValue: T,
  _refreshIntervalMs: number,
): T {
  return defaultValue
}

export function getFeatureValue_DEPRECATED<T>(
  _feature: string,
  defaultValue: T,
): Promise<T> {
  return Promise.resolve(defaultValue)
}

// ── Dynamic config (delegates to feature value getters) ──

export function getDynamicConfig_BLOCKS_ON_INIT<T>(
  _configName: string,
  defaultValue: T,
): Promise<T> {
  return Promise.resolve(defaultValue)
}

export function getDynamicConfig_CACHED_MAY_BE_STALE<T>(
  _configName: string,
  defaultValue: T,
): T {
  return defaultValue
}

// ── Gate checks (always return false) ──

export function checkStatsigFeatureGate_CACHED_MAY_BE_STALE(
  _gate: string,
): boolean {
  return false
}

export function checkGate_CACHED_OR_BLOCKING(
  _gate: string,
): Promise<boolean> {
  return Promise.resolve(false)
}

export function checkSecurityRestrictionGate(
  _gate: string,
): Promise<boolean> {
  return Promise.resolve(false)
}

// ── Lifecycle (all no-op) ──

export async function initializeGrowthBook(): Promise<null> {
  return null
}

export function resetGrowthBook(): void {}

export function refreshGrowthBookAfterAuthChange(): void {}

export function refreshGrowthBookFeatures(): Promise<void> {
  return Promise.resolve()
}

export function setupPeriodicGrowthBookRefresh(): void {}

export function stopPeriodicGrowthBookRefresh(): void {}

export function onGrowthBookRefresh(
  _listener: () => void | Promise<void>,
): () => void {
  return () => {}
}

export function hasGrowthBookEnvOverride(_feature: string): boolean {
  return false
}

export function getGrowthBookConfigOverrides(): Record<string, unknown> {
  return {}
}

export function setGrowthBookConfigOverride(
  _feature: string,
  _value: unknown,
): void {}

export function clearGrowthBookConfigOverrides(): void {}

export function getAllGrowthBookFeatures(): Record<string, unknown> {
  return {}
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

// ── Type (preserved for API compatibility) ──

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
  github?: unknown
}
