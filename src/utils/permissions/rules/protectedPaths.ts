/**
 * Global Protected Paths registry.
 *
 * Protected paths are files/directories that always require approval,
 * regardless of mode or allow rules. This is a global immunization layer
 * inspired by Claude Code's Protected Paths design.
 *
 * Usage:
 *   isPathProtected('.git/config')      // -> { pattern: '.git/**', reason: '...' }
 *   registerProtectedPath({ pattern: '.env', reason: 'Secrets' })
 */

export interface ProtectedPathRule {
  /** Glob pattern (supports ** for recursive, * for single segment) */
  pattern: string
  /** Why this path is protected */
  reason: string
  /** Whether the auto mode classifier can evaluate this */
  classifierApprovable: boolean
}

const DEFAULT_PROTECTED_PATHS: readonly ProtectedPathRule[] = [
  // Git internals
  { pattern: '.git/**', reason: 'Git internal data', classifierApprovable: false },
  { pattern: '.git', reason: 'Git internal data', classifierApprovable: false },

  // Claude configuration
  { pattern: '.claude/**', reason: 'Claude configuration', classifierApprovable: true },
  { pattern: '.claude', reason: 'Claude configuration', classifierApprovable: true },

  // IDE configuration
  { pattern: '.vscode/**', reason: 'IDE configuration', classifierApprovable: true },
  { pattern: '.idea/**', reason: 'IDE configuration', classifierApprovable: true },

  // Shell configuration
  { pattern: '.bashrc', reason: 'Shell configuration', classifierApprovable: true },
  { pattern: '.zshrc', reason: 'Shell configuration', classifierApprovable: true },
  { pattern: '.bash_profile', reason: 'Shell configuration', classifierApprovable: true },
  { pattern: '.profile', reason: 'Shell configuration', classifierApprovable: true },
  { pattern: '.zshenv', reason: 'Shell configuration', classifierApprovable: true },

  // SSH
  { pattern: '.ssh/**', reason: 'SSH configuration', classifierApprovable: false },
  { pattern: '.ssh', reason: 'SSH configuration', classifierApprovable: false },

  // Environment secrets
  { pattern: '.env', reason: 'Environment secrets', classifierApprovable: true },
  { pattern: '.env.*', reason: 'Environment secrets', classifierApprovable: true },

  // Credentials
  { pattern: '.netrc', reason: 'Network credentials', classifierApprovable: false },
  { pattern: '.npmrc', reason: 'Package manager credentials', classifierApprovable: true },
]

// Runtime-extensible registry (default paths + user-registered)
const registry: ProtectedPathRule[] = [...DEFAULT_PROTECTED_PATHS]

/**
 * Register a new protected path rule.
 */
export function registerProtectedPath(rule: ProtectedPathRule): void {
  registry.push(rule)
}

/**
 * Check if a path is protected.
 * Returns the matching rule, or null if not protected.
 */
export function isPathProtected(path: string): ProtectedPathRule | null {
  // Normalize: strip leading ./ and trailing /
  const normalized = path.replace(/^\.\//, '').replace(/\/$/, '')

  for (const rule of registry) {
    if (matchesGlob(normalized, rule.pattern)) {
      return rule
    }
  }
  return null
}

/**
 * Simple glob matching for protected path patterns.
 * Supports ** (recursive), * (single segment).
 */
function matchesGlob(path: string, pattern: string): boolean {
  // Exact match
  if (path === pattern) return true

  // ** pattern: match anything under this directory
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -3)
    if (path === prefix || path.startsWith(prefix + '/')) {
      return true
    }
  }

  // * pattern: match single segment (no /)
  if (pattern.endsWith('.*')) {
    const prefix = pattern.slice(0, -1)
    if (path.startsWith(prefix) && path[prefix.length] === '.' && !path.includes('/')) {
      return true
    }
  }

  // Single * at end: match anything starting with prefix
  if (pattern.endsWith('*') && !pattern.includes('**')) {
    const prefix = pattern.slice(0, -1)
    if (path.startsWith(prefix)) {
      return true
    }
  }

  return false
}

/**
 * Get all registered protected path rules (for debugging/testing).
 */
export function getAllProtectedPaths(): readonly ProtectedPathRule[] {
  return [...registry]
}
