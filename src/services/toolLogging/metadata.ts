import { extname } from 'path'

import { isEnvTruthy } from '../../utils/envUtils.js'

/**
 * Marker type used by call sites to document that a value is safe for logging.
 * In the open build product analytics are inert, so this remains a compile-time label.
 */
export type SafeLogValue = never

export function sanitizeToolNameForLogging(
  toolName: string,
): SafeLogValue {
  if (toolName.startsWith('mcp__')) {
    return 'mcp_tool' as SafeLogValue
  }
  return toolName as SafeLogValue
}

/**
 * Keep env-gated behavior so existing debug workflows still work if explicitly enabled.
 */
export function isToolDetailsLoggingEnabled(): boolean {
  return isEnvTruthy(process.env.OTEL_LOG_TOOL_DETAILS)
}

/**
 * Open build defaults to sanitization; only local-agent mode keeps detail parity.
 */
export function isToolDetailsCaptureEnabled(
  mcpServerType: string | undefined,
  _mcpServerBaseUrl: string | undefined,
): boolean {
  if (process.env.CLAUDE_CODE_ENTRYPOINT === 'local-agent') {
    return true
  }
  if (mcpServerType === 'claudeai-proxy') {
    return true
  }
  return false
}

export function extractMcpToolDetails(toolName: string):
  | {
      serverName: SafeLogValue
      mcpToolName: SafeLogValue
    }
  | undefined {
  if (!toolName.startsWith('mcp__')) {
    return undefined
  }

  const parts = toolName.split('__')
  if (parts.length < 3) {
    return undefined
  }

  const serverName = parts[1]
  const mcpToolName = parts.slice(2).join('__')
  if (!serverName || !mcpToolName) {
    return undefined
  }

  return {
    serverName:
      serverName as SafeLogValue,
    mcpToolName:
      mcpToolName as SafeLogValue,
  }
}

export function getMcpToolDetailsForLogging(
  toolName: string,
  mcpServerType: string | undefined,
  mcpServerBaseUrl: string | undefined,
): {
  mcpServerName?: SafeLogValue
  mcpToolName?: SafeLogValue
} {
  const details = extractMcpToolDetails(toolName)
  if (!details) {
    return {}
  }
  if (!isToolDetailsCaptureEnabled(mcpServerType, mcpServerBaseUrl)) {
    return {}
  }
  return {
    mcpServerName: details.serverName,
    mcpToolName: details.mcpToolName,
  }
}

export function extractSkillName(
  toolName: string,
  input: unknown,
): SafeLogValue | undefined {
  if (toolName !== 'Skill') {
    return undefined
  }

  if (
    typeof input === 'object' &&
    input !== null &&
    'skill' in input &&
    typeof (input as { skill: unknown }).skill === 'string'
  ) {
    return (input as { skill: string })
      .skill as SafeLogValue
  }

  return undefined
}

const TOOL_INPUT_STRING_TRUNCATE_AT = 512
const TOOL_INPUT_STRING_TRUNCATE_TO = 128
const TOOL_INPUT_MAX_JSON_CHARS = 4 * 1024
const TOOL_INPUT_MAX_COLLECTION_ITEMS = 20
const TOOL_INPUT_MAX_DEPTH = 2

function truncateToolInputValue(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    if (value.length > TOOL_INPUT_STRING_TRUNCATE_AT) {
      return `${value.slice(0, TOOL_INPUT_STRING_TRUNCATE_TO)}…[${value.length} chars]`
    }
    return value
  }
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    value === undefined
  ) {
    return value
  }
  if (depth >= TOOL_INPUT_MAX_DEPTH) {
    return '<nested>'
  }
  if (Array.isArray(value)) {
    const mapped = value
      .slice(0, TOOL_INPUT_MAX_COLLECTION_ITEMS)
      .map(v => truncateToolInputValue(v, depth + 1))
    if (value.length > TOOL_INPUT_MAX_COLLECTION_ITEMS) {
      mapped.push(`…[${value.length} items]`)
    }
    return mapped
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !k.startsWith('_'))
    const mapped = entries
      .slice(0, TOOL_INPUT_MAX_COLLECTION_ITEMS)
      .map(([k, v]) => [k, truncateToolInputValue(v, depth + 1)])
    if (entries.length > TOOL_INPUT_MAX_COLLECTION_ITEMS) {
      mapped.push(['…', `${entries.length} keys`])
    }
    return Object.fromEntries(mapped)
  }
  return String(value)
}

export function extractToolInputForLogging(
  input: unknown,
): string | undefined {
  if (!isToolDetailsLoggingEnabled()) {
    return undefined
  }
  const truncated = truncateToolInputValue(input)
  let json = JSON.stringify(truncated)
  if (json.length > TOOL_INPUT_MAX_JSON_CHARS) {
    json = json.slice(0, TOOL_INPUT_MAX_JSON_CHARS) + '…[truncated]'
  }
  return json
}

const MAX_FILE_EXTENSION_LENGTH = 10

export function getFileExtensionForLogging(
  filePath: string,
): SafeLogValue | undefined {
  const ext = extname(filePath).toLowerCase()
  if (!ext || ext === '.') {
    return undefined
  }

  const extension = ext.slice(1)
  if (extension.length > MAX_FILE_EXTENSION_LENGTH) {
    return 'other' as SafeLogValue
  }

  return extension as SafeLogValue
}

const FILE_COMMANDS = new Set([
  'rm',
  'mv',
  'cp',
  'touch',
  'mkdir',
  'chmod',
  'chown',
  'cat',
  'head',
  'tail',
  'sort',
  'stat',
  'diff',
  'wc',
  'grep',
  'rg',
  'sed',
])

const COMPOUND_OPERATOR_REGEX = /\s*(?:&&|\|\||[;|])\s*/
const WHITESPACE_REGEX = /\s+/

export function getFileExtensionsFromBashCommandForLogging(
  command: string,
  simulatedSedEditFilePath?: string,
): SafeLogValue | undefined {
  if (!command.includes('.') && !simulatedSedEditFilePath) return undefined

  let result: string | undefined
  const seen = new Set<string>()

  if (simulatedSedEditFilePath) {
    const ext = getFileExtensionForLogging(simulatedSedEditFilePath)
    if (ext) {
      seen.add(ext)
      result = ext
    }
  }

  for (const subcmd of command.split(COMPOUND_OPERATOR_REGEX)) {
    if (!subcmd) continue
    const tokens = subcmd.split(WHITESPACE_REGEX)
    if (tokens.length < 2) continue

    const firstToken = tokens[0]!
    const slashIdx = firstToken.lastIndexOf('/')
    const baseCmd = slashIdx >= 0 ? firstToken.slice(slashIdx + 1) : firstToken
    if (!FILE_COMMANDS.has(baseCmd)) continue

    for (let i = 1; i < tokens.length; i++) {
      const arg = tokens[i]!
      if (arg.charCodeAt(0) === 45) continue
      const ext = getFileExtensionForLogging(arg)
      if (ext && !seen.has(ext)) {
        seen.add(ext)
        result = result ? result + ',' + ext : ext
      }
    }
  }

  if (!result) return undefined
  return result as SafeLogValue
}

export function getBashFileExtensionForLogging(
  command: string,
  simulatedSedEditFilePath?: string,
): SafeLogValue | undefined {
  return getFileExtensionsFromBashCommandForLogging(
    command,
    simulatedSedEditFilePath,
  )
}
