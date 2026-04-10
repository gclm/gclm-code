/**
 * Dangerous Patterns Registry.
 *
 * Centralizes the dangerous pattern checks currently scattered across:
 * - permissionSetup.ts: isDangerousBashPermission, isDangerousPowerShellPermission, isDangerousTaskPermission
 * - dangerousPatterns.ts: DANGEROUS_BASH_PATTERNS
 *
 * Each pattern has a severity that determines how it's handled:
 * - 'block-auto': strips the rule at auto-mode entry
 * - 'warn': logs a warning but doesn't strip
 */

export interface DangerousPatternRule {
  /** Pattern name for logging */
  name: string
  /** Tool names this applies to (empty = all tools) */
  tools: readonly string[]
  /** Patterns to match against rule content */
  patterns: readonly string[]
  /** Severity */
  severity: 'block-auto' | 'warn' | 'info'
  /** Whether the pattern matches the entire tool (no ruleContent) */
  matchesToolOnly?: boolean
}

const registry: DangerousPatternRule[] = []

/**
 * Register a dangerous pattern rule.
 */
export function registerDangerousPattern(rule: DangerousPatternRule): void {
  registry.push(rule)
}

/**
 * Check if a tool+ruleContent combination matches a dangerous pattern.
 * Returns the matching rule, or null if not dangerous.
 */
export function isDangerousPattern(
  toolName: string,
  ruleContent: string | undefined,
): DangerousPatternRule | null {
  // Check for tool-level dangerous patterns (no ruleContent)
  if (ruleContent === undefined) {
    for (const rule of registry) {
      if (rule.matchesToolOnly && (rule.tools.length === 0 || rule.tools.includes(toolName))) {
        return rule
      }
    }
    return null
  }

  const content = ruleContent.toLowerCase()

  for (const rule of registry) {
    if (rule.matchesToolOnly) continue
    if (rule.tools.length > 0 && !rule.tools.includes(toolName)) continue

    for (const pattern of rule.patterns) {
      const lowerPattern = pattern.toLowerCase()
      // Exact match
      if (content === lowerPattern) return rule
      // Prefix match (pattern:* or pattern *)
      if (content === `${lowerPattern}:*` || content === `${lowerPattern} *`) return rule
      // Wildcard prefix (pattern*)
      if (content.startsWith(lowerPattern) && content[lowerPattern.length] === '*') return rule
      // Content starts with pattern (e.g., "python " in "python -c ...")
      if (content.startsWith(lowerPattern + ' ') || content.startsWith(lowerPattern + ':')) return rule
    }
  }

  return null
}

/**
 * Get all registered dangerous pattern rules.
 */
export function getAllDangerousPatterns(): readonly DangerousPatternRule[] {
  return [...registry]
}

// ============================================================================
// Default pattern registrations
// ============================================================================

function registerDefaults(): void {
  // Tool-level allow (any tool with no content = YOLO)
  registerDangerousPattern({
    name: 'tool-level-allow',
    tools: ['Bash', 'PowerShell', 'Tmux'],
    patterns: [],
    severity: 'block-auto',
    matchesToolOnly: true,
  })

  // Cross-platform interpreters and runners
  registerDangerousPattern({
    name: 'code-execution-interpreters',
    tools: ['Bash', 'PowerShell'],
    patterns: [
      'python', 'python3', 'python2',
      'node', 'deno', 'tsx',
      'ruby', 'perl', 'php', 'lua',
    ],
    severity: 'block-auto',
  })

  // Package runners
  registerDangerousPattern({
    name: 'package-runners',
    tools: ['Bash', 'PowerShell'],
    patterns: [
      'npx', 'bunx',
      'npm run', 'yarn run', 'pnpm run', 'bun run',
    ],
    severity: 'block-auto',
  })

  // Shell escapes
  registerDangerousPattern({
    name: 'shell-escapes',
    tools: ['Bash', 'PowerShell'],
    patterns: [
      'bash', 'sh', 'zsh', 'fish',
      'ssh',
    ],
    severity: 'block-auto',
  })

  // Execution primitives
  registerDangerousPattern({
    name: 'execution-primitives',
    tools: ['Bash'],
    patterns: [
      'eval', 'exec', 'env', 'xargs', 'sudo',
    ],
    severity: 'block-auto',
  })

  // PowerShell-specific dangerous patterns
  registerDangerousPattern({
    name: 'ps-interpreters',
    tools: ['PowerShell'],
    patterns: [
      'pwsh', 'cmd', 'wsl',
    ],
    severity: 'block-auto',
  })

  registerDangerousPattern({
    name: 'ps-evaluators',
    tools: ['PowerShell'],
    patterns: [
      'iex', 'invoke-expression', 'invoke-command',
    ],
    severity: 'block-auto',
  })

  registerDangerousPattern({
    name: 'ps-process-spawners',
    tools: ['PowerShell'],
    patterns: [
      'start-process',
    ],
    severity: 'block-auto',
  })

  registerDangerousPattern({
    name: 'ps-net-escapes',
    tools: ['PowerShell'],
    patterns: [
      'add-type', 'new-object',
    ],
    severity: 'block-auto',
  })

  // Anthropic-internal patterns
  if (process.env.USER_TYPE === 'ant') {
    registerDangerousPattern({
      name: 'ant-internal-tools',
      tools: ['Bash'],
      patterns: [
        'fa run', 'coo',
        'gh', 'gh api',
        'curl', 'wget',
        'git', // config core.sshCommand / hooks = arbitrary code
        'kubectl', 'aws', 'gcloud', 'gsutil',
      ],
      severity: 'block-auto',
    })
  }
}

// Register defaults on module load
registerDefaults()
