/**
 * Declarative mode cycle definition.
 *
 * Replaces the hardcoded switch statement in getNextPermissionMode.ts
 * with a data-driven cycle that supports skip conditions.
 *
 * Usage:
 *   getNextPermissionMode('default', cycle)  // -> 'acceptEdits'
 */

import type { ToolPermissionContext, PermissionMode } from '../../../types/permissions.js'

/**
 * A mode cycle definition: ordered list of modes with optional skip conditions.
 */
export interface ModeCycleDefinition {
  /** Ordered list of modes to cycle through */
  cycle: readonly PermissionMode[]
  /** Skip conditions: mode -> (context) => should skip */
  skipConditions?: Map<PermissionMode, (ctx: ToolPermissionContext) => boolean>
}

/**
 * Get the next mode in the cycle, skipping modes whose conditions are met.
 */
export function getNextPermissionModeFromCycle(
  currentMode: PermissionMode,
  cycle: ModeCycleDefinition,
  context: ToolPermissionContext,
): PermissionMode {
  const currentIndex = cycle.cycle.indexOf(currentMode)
  if (currentIndex < 0) {
    return cycle.cycle[0]
  }

  const skipConditions = cycle.skipConditions ?? new Map()
  const len = cycle.cycle.length

  // Try each subsequent mode, wrapping around
  for (let i = 1; i <= len; i++) {
    const nextIndex = (currentIndex + i) % len
    const nextMode = cycle.cycle[nextIndex]
    const shouldSkip = skipConditions.get(nextMode)?.(context) ?? false
    if (!shouldSkip) {
      return nextMode
    }
  }

  // All modes are skipped — stay on current
  return currentMode
}

/**
 * Build the default mode cycle for the current user type.
 */
export function createDefaultCycle(
  userType: string = process.env.USER_TYPE ?? 'external',
): ModeCycleDefinition {
  const isAnt = userType === 'ant'

  const cycle: readonly PermissionMode[] = isAnt
    ? ['default', 'bypassPermissions', 'auto']
    : ['default', 'acceptEdits', 'plan', 'bypassPermissions']

  const skipConditions = new Map<PermissionMode, (ctx: ToolPermissionContext) => boolean>()

  // Auto mode: skip if gate not enabled or not available
  if (isAnt) {
    skipConditions.set('auto', (ctx) => {
      try {
        const { feature } = require('bun:bundle') as { feature: (name: string) => boolean }
        if (!feature('TRANSCRIPT_CLASSIFIER')) return true
        const { isAutoModeGateEnabled } = require('../permissionSetup.js') as typeof import('../permissionSetup.js')
        return !isAutoModeGateEnabled() || !ctx.isAutoModeAvailable
      } catch {
        return true
      }
    })
  }

  // Bypass: skip if not available
  skipConditions.set('bypassPermissions', (ctx) => {
    return !ctx.isBypassPermissionsModeAvailable
  })

  return { cycle, skipConditions }
}
