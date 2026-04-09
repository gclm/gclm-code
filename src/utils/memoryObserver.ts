/**
 * Session-level memory observation.
 *
 * Lightweight snapshot collection at key query lifecycle points, with
 * transcript persistence for post-crash analysis. Does NOT perform heap
 * dumps or any kind of memory remediation — observation only.
 *
 * Activated only when CLAUDE_CODE_PROFILE_MEMORY=1.
 */

import { randomUUID } from 'crypto'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MemorySnapshot = {
  timestamp: number
  heapUsed: number
  heapTotal: number
  rss: number
  external: number
  messageCount: number
  toolUseResultCount: number
  toolUseResultBytesEst: number
  compactBoundaryCount: number
  label: string
}

export type MemoryTrend = {
  rateMbPerHour: number
  durationMs: number
  startHeapUsed: number
  endHeapUsed: number
  deltaMb: number
}

export type MemorySummary = {
  current: MemorySnapshot | null
  peak: MemorySnapshot | null
  trend: MemoryTrend | null
  snapshotCount: number
}

// ---------------------------------------------------------------------------
// Core helpers
// ---------------------------------------------------------------------------

const MB = 1024 * 1024
const HIGH_HEAP_THRESHOLD = 1.5 * 1024 * 1024 * 1024 // 1.5 GB
const MAX_SNAPSHOTS = 1000
const KEEP_EACH_EDGE = 50

/**
 * Estimate the serialized byte size of a value.
 * Uses string length as a proxy (JS strings are UTF-16, but for JSON
 * content the difference is small enough for estimation purposes).
 */
export function estimateBytes(value: unknown): number {
  try {
    return JSON.stringify(value).length
  } catch {
    return 0
  }
}

/**
 * Capture a lightweight memory snapshot.
 */
export function captureMemorySnapshot(options: {
  messageCount: number
  toolUseResultCount: number
  toolUseResultBytesEst: number
  compactBoundaryCount: number
  label: string
}): MemorySnapshot {
  const mu = process.memoryUsage()
  return {
    timestamp: Date.now(),
    heapUsed: mu.heapUsed,
    heapTotal: mu.heapTotal,
    rss: mu.rss,
    external: mu.external,
    messageCount: options.messageCount,
    toolUseResultCount: options.toolUseResultCount,
    toolUseResultBytesEst: options.toolUseResultBytesEst,
    compactBoundaryCount: options.compactBoundaryCount,
    label: options.label,
  }
}

// ---------------------------------------------------------------------------
// SessionMemoryTracker
// ---------------------------------------------------------------------------

class SessionMemoryTracker {
  private snapshots: MemorySnapshot[] = []
  private sessionId = randomUUID()

  record(snapshot: MemorySnapshot): void {
    this.snapshots.push(snapshot)

    // Sampling: keep first N, last N, and evenly-spaced middle
    if (this.snapshots.length > MAX_SNAPSHOTS) {
      this.downsample()
    }
  }

  private downsample(): void {
    const total = this.snapshots.length
    const step = Math.floor((total - KEEP_EACH_EDGE * 2) / (MAX_SNAPSHOTS - KEEP_EACH_EDGE * 2))
    const kept: MemorySnapshot[] = [
      ...this.snapshots.slice(0, KEEP_EACH_EDGE),
    ]
    for (let i = KEEP_EACH_EDGE; i < total - KEEP_EACH_EDGE; i += step) {
      kept.push(this.snapshots[i]!)
    }
    kept.push(...this.snapshots.slice(-KEEP_EACH_EDGE))
    this.snapshots = kept
  }

  getTrend(): MemoryTrend | null {
    if (this.snapshots.length < 2) return null
    const first = this.snapshots[0]!
    const last = this.snapshots[this.snapshots.length - 1]!
    const durationMs = last.timestamp - first.timestamp
    if (durationMs <= 0) return null
    const deltaMb = (last.heapUsed - first.heapUsed) / MB
    return {
      rateMbPerHour: (deltaMb / durationMs) * 3600000,
      durationMs,
      startHeapUsed: first.heapUsed,
      endHeapUsed: last.heapUsed,
      deltaMb,
    }
  }

  getPeak(): MemorySnapshot | null {
    if (this.snapshots.length === 0) return null
    let peak = this.snapshots[0]
    for (let i = 1; i < this.snapshots.length; i++) {
      if (this.snapshots[i]!.heapUsed > peak.heapUsed) {
        peak = this.snapshots[i]!
      }
    }
    return peak
  }

  getSummary(): MemorySummary {
    return {
      current: this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1]! : null,
      peak: this.getPeak(),
      trend: this.getTrend(),
      snapshotCount: this.snapshots.length,
    }
  }

  shouldAutoDump(): boolean {
    const current = this.snapshots[this.snapshots.length - 1]
    return current ? current.heapUsed > HIGH_HEAP_THRESHOLD : false
  }

  getCurrent(): MemorySnapshot | null {
    return this.snapshots.length > 0 ? this.snapshots[this.snapshots.length - 1]! : null
  }

  getSessionId(): string {
    return this.sessionId
  }

  getSnapshots(): ReadonlyArray<MemorySnapshot> {
    return this.snapshots
  }

  /**
   * Check current memory state and emit a console warning if thresholds
   * are exceeded. Designed to be called after each query turn.
   */
  checkAndWarn(): void {
    const current = this.getCurrent()
    if (!current) return

    const heapMb = current.heapUsed / MB
    const trend = this.getTrend()

    const parts: string[] = []
    parts.push(`[memory] heap=${heapMb.toFixed(0)} MB`)
    parts.push(`messages=${current.messageCount}`)
    parts.push(`toolUseResults=${current.toolUseResultCount} (${formatBytes(current.toolUseResultBytesEst)})`)

    if (trend && trend.durationMs > 60_000) {
      const sign = trend.rateMbPerHour >= 0 ? '+' : ''
      parts.push(`trend=${sign}${trend.rateMbPerHour.toFixed(1)} MB/hr`)

      if (trend.rateMbPerHour > 100) {
        console.warn(
          `[memory] WARNING: Session memory growing ${sign}${trend.rateMbPerHour.toFixed(1)} MB/hr over ${formatDuration(trend.durationMs)}. Consider /heapdump or ending session.`,
        )
      }
    }

    if (current.heapUsed > HIGH_HEAP_THRESHOLD) {
      console.warn(
        `[memory] CRITICAL: heapUsed=${heapMb.toFixed(0)} MB exceeds ${HIGH_HEAP_THRESHOLD / MB} MB threshold. Run /heapdump or restart session.`,
      )
    } else if (current.heapUsed > MB * 1200) {
      console.warn(
        `[memory] ${parts.join(' | ')}. Approaching heap limit (Node default ~4288 MB).`,
      )
    }
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / MB).toFixed(0)} MB`
}

function formatDuration(ms: number): string {
  if (ms < 60_000) return `${(ms / 1000).toFixed(0)}s`
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(0)}m`
  return `${(ms / 3_600_000).toFixed(1)}h`
}

// ---------------------------------------------------------------------------
// Module-level singleton
// ---------------------------------------------------------------------------

let sessionTracker: SessionMemoryTracker | null = null

export function getOrCreateSessionTracker(): SessionMemoryTracker {
  if (!sessionTracker) {
    sessionTracker = new SessionMemoryTracker()
  }
  return sessionTracker
}

/**
 * Reset the session tracker (e.g. when starting a fresh REPL session).
 */
export function resetSessionTracker(): void {
  sessionTracker = null
}
