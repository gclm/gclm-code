/**
 * Approvable trait for tools.
 * Inspired by Codex CLI's Approvable<Req> trait.
 *
 * Tools that implement this interface can have their permission decisions
 * cached and deduplicated via the ApprovalStore.
 */

import type { DecisionResult } from './DecisionResult.js'

/**
 * Trait for tools that require custom approval logic.
 */
export interface Approvable<ApprovalKey> {
  /**
   * Extract the key(s) that uniquely identify this permission request.
   * Used for approval caching and deduplication.
   */
  approvalKeys(input: Record<string, unknown>): ApprovalKey[]
}

/**
 * Entry in the approval store.
 */
interface StoreEntry {
  decision: DecisionResult
  /** Expiry timestamp (ms). 0 = no expiry (session-scoped) */
  expiresAt: number
}

/**
 * Approval store for caching permission decisions.
 * Serializable for persistence across sessions.
 */
export class ApprovalStore {
  private map: Map<string, StoreEntry> = new Map()

  /**
   * Get a cached approval by key.
   * Returns undefined if not found or expired.
   */
  get(key: string): DecisionResult | undefined {
    const entry = this.map.get(key)
    if (!entry) return undefined
    if (entry.expiresAt > 0 && Date.now() > entry.expiresAt) {
      this.map.delete(key)
      return undefined
    }
    return entry.decision
  }

  /**
   * Store an approval decision.
   * @param ttlMs - time-to-live in ms (0 = session-scoped, no expiry)
   */
  set(key: string, result: DecisionResult, ttlMs: number = 0): void {
    this.map.set(key, {
      decision: result,
      expiresAt: ttlMs > 0 ? Date.now() + ttlMs : 0,
    })
  }

  /**
   * Clear all approvals.
   */
  clear(): void {
    this.map.clear()
  }

  /**
   * Serialize the store to JSON (for persistence).
   */
  serialize(): string {
    return JSON.stringify(Object.fromEntries(this.map))
  }

  /**
   * Deserialize from JSON.
   */
  static deserialize(json: string): ApprovalStore {
    const store = new ApprovalStore()
    const data = JSON.parse(json) as Record<string, StoreEntry>
    for (const [key, entry] of Object.entries(data)) {
      store.map.set(key, entry)
    }
    return store
  }

  /**
   * Get the number of cached approvals.
   */
  get size(): number {
    return this.map.size
  }
}
