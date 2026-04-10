/**
 * Structured Permission Rule (ExecPolicy).
 *
 * Replaces string-matching PermissionRuleValue with a structured representation.
 * Inspired by Codex CLI's exec_policy prefix_rule concept.
 *
 * Current rules are parsed from strings like:
 *   "Bash(npm install)"         → exact match
 *   "Bash(npm:*)"                → prefix match
 *   "Bash(*)"                    → wildcard (tool-wide)
 *
 * The structured ExecPolicy makes these explicit and adds path/cwd scoping.
 */

/**
 * Kind of rule matching strategy.
 */
export type RuleKind = 'exact' | 'prefix' | 'wildcard' | 'path'

/**
 * Structured permission rule.
 */
export interface ExecPolicy {
  /** Tool name this policy applies to */
  toolName: string
  /** Matching strategy */
  kind: RuleKind
  /** Rule content (undefined for wildcard/tool-wide) */
  content?: string
  /** Optional: restrict to specific working directory */
  workingDir?: string
  /** Optional: tags for rule classification */
  tags?: string[]
}

/**
 * Compiled ExecPolicy ready for matching.
 * Pre-computed regex/prefix for efficient matching.
 */
export interface CompiledExecPolicy {
  policy: ExecPolicy
  /** Pre-computed prefix for prefix rules */
  prefix?: string
  /** Pre-compiled regex for path rules */
  pathRegex?: RegExp
}

/**
 * Compile an ExecPolicy for efficient matching.
 */
export function compileExecPolicy(policy: ExecPolicy): CompiledExecPolicy {
  const result: CompiledExecPolicy = { policy }

  switch (policy.kind) {
    case 'prefix':
      result.prefix = policy.content
      break
    case 'path':
      // Convert glob-like pattern to regex
      const pattern = policy.content ?? ''
      result.pathRegex = new RegExp(
        '^' +
        pattern.replace(/\*\*/g, '__DOUBLESTAR__')
          .replace(/\*/g, '[^/]*')
          .replace(/__DOUBLESTAR__/g, '.*') +
        '$',
      )
      break
    case 'exact':
    case 'wildcard':
      break
  }

  return result
}

/**
 * Check if a command/content matches a compiled policy.
 */
export function matchesExecPolicy(
  compiled: CompiledExecPolicy,
  content: string,
): boolean {
  switch (compiled.policy.kind) {
    case 'exact':
      return content === compiled.policy.content
    case 'prefix':
      return compiled.prefix !== undefined &&
        (content === compiled.prefix ||
         content.startsWith(compiled.prefix + ':') ||
         content.startsWith(compiled.prefix + ' '))
    case 'wildcard':
      return true
    case 'path':
      return compiled.pathRegex?.test(content) ?? false
  }
}

/**
 * Convert a legacy string rule to an ExecPolicy.
 * Handles formats:
 *   "ToolName"           → wildcard
 *   "ToolName(content)"  → exact (no * or :)
 *   "ToolName(content:*)" → prefix
 *   "ToolName(*)"        → wildcard
 */
export function execPolicyFromString(ruleString: string): ExecPolicy | null {
  const parenOpen = ruleString.indexOf('(')
  const parenClose = ruleString.lastIndexOf(')')

  if (parenOpen < 0 || parenClose < 0 || parenClose <= parenOpen) {
    // No content = tool-wide wildcard
    return { toolName: ruleString, kind: 'wildcard' }
  }

  const toolName = ruleString.slice(0, parenOpen)
  const content = ruleString.slice(parenOpen + 1, parenClose)

  if (!content || content === '*') {
    return { toolName, kind: 'wildcard' }
  }

  if (content.endsWith(':*')) {
    return { toolName, kind: 'prefix', content: content.slice(0, -2) }
  }

  return { toolName, kind: 'exact', content }
}

/**
 * Convert an ExecPolicy back to a string rule.
 */
export function execPolicyToString(policy: ExecPolicy): string {
  if (policy.kind === 'wildcard' || !policy.content) {
    return policy.toolName
  }
  if (policy.kind === 'prefix') {
    return `${policy.toolName}(${policy.content}:*)`
  }
  return `${policy.toolName}(${policy.content})`
}
