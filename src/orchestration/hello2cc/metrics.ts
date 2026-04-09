type Hello2ccMetrics = {
  routeGuidanceCount: number
  normalizationCount: number
  memoryHitCount: number
  preconditionBlockCount: number
  dedupSkipCount: number
}

const metricsStore = new Map<string, Hello2ccMetrics>()

function ensureMetrics(sessionId: string): Hello2ccMetrics {
  const existing = metricsStore.get(sessionId)
  if (existing) return existing
  const fresh: Hello2ccMetrics = {
    routeGuidanceCount: 0,
    normalizationCount: 0,
    memoryHitCount: 0,
    preconditionBlockCount: 0,
    dedupSkipCount: 0,
  }
  metricsStore.set(sessionId, fresh)
  return fresh
}

export function incrementRouteGuidance(sessionId: string): void {
  ensureMetrics(sessionId).routeGuidanceCount++
}

export function incrementNormalization(sessionId: string): void {
  ensureMetrics(sessionId).normalizationCount++
}

export function incrementMemoryHit(sessionId: string): void {
  ensureMetrics(sessionId).memoryHitCount++
}

export function incrementPreconditionBlock(sessionId: string): void {
  ensureMetrics(sessionId).preconditionBlockCount++
}

export function incrementDedupSkip(sessionId: string): void {
  ensureMetrics(sessionId).dedupSkipCount++
}

export function getHello2ccMetrics(sessionId: string): Hello2ccMetrics {
  return ensureMetrics(sessionId)
}

export function clearHello2ccMetrics(sessionId: string): void {
  metricsStore.delete(sessionId)
}

export function clearAllHello2ccMetrics(): void {
  metricsStore.clear()
}
