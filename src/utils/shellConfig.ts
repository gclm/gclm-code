/**
 * Utilities for managing shell configuration files (like .bashrc, .zshrc)
 * Used for managing installer-created CLI aliases and PATH entries
 */

import { open, readFile, stat } from 'fs/promises'
import { homedir as osHomedir } from 'os'
import { join } from 'path'
import { isFsInaccessible } from './errors.js'
import {
  getLocalClaudeCompatibilityPath,
  getLocalCliPath,
} from './localInstaller.js'

export const CLI_ALIAS_REGEX = /^\s*alias\s+gc\s*=/
const INSTALLER_ALIAS_REGEX = /^\s*alias\s+(gc|claude)\s*=/
const INSTALLER_ALIAS_NAMES = new Set(['gc', 'claude'])

type EnvLike = Record<string, string | undefined>

type ShellConfigOptions = {
  env?: EnvLike
  homedir?: string
}

/**
 * Get the paths to shell configuration files
 * Respects ZDOTDIR for zsh users
 * @param options Optional overrides for testing (env, homedir)
 */
export function getShellConfigPaths(
  options?: ShellConfigOptions,
): Record<string, string> {
  const home = options?.homedir ?? osHomedir()
  const env = options?.env ?? process.env
  const zshConfigDir = env.ZDOTDIR || home
  return {
    zsh: join(zshConfigDir, '.zshrc'),
    bash: join(home, '.bashrc'),
    fish: join(home, '.config/fish/config.fish'),
  }
}

/**
 * Filter out installer-created aliases from an array of lines.
 * Only removes aliases pointing to the local installer wrappers so custom
 * aliases that target other commands or paths are preserved.
 */
export function filterInstallerAliases(lines: string[]): {
  filtered: string[]
  removedAliases: string[]
} {
  const removedAliases: string[] = []
  const installerTargets = new Set([
    getLocalCliPath(),
    getLocalClaudeCompatibilityPath(),
  ])
  const filtered = lines.filter(line => {
    const aliasMatch = line.match(/^\s*alias\s+([A-Za-z0-9_-]+)\s*=/)
    const aliasName = aliasMatch?.[1]
    if (!aliasName || !INSTALLER_ALIAS_NAMES.has(aliasName)) {
      return true
    }

    if (INSTALLER_ALIAS_REGEX.test(line)) {
      const target = extractAliasTarget(line, aliasName)
      if (target && installerTargets.has(target)) {
        removedAliases.push(aliasName)
        return false
      }
    }
    return true
  })

  return { filtered, removedAliases: [...new Set(removedAliases)] }
}

function extractAliasTarget(line: string, aliasName: string): string | null {
  let match = line.match(
    new RegExp(`alias\\s+${aliasName}\\s*=\\s*["']([^"']+)["']`),
  )
  if (!match) {
    match = line.match(
      new RegExp(`alias\\s+${aliasName}\\s*=\\s*([^#\\n]+)`),
    )
  }

  return match?.[1]?.trim() ?? null
}

/**
 * Read a file and split it into lines
 * Returns null if file doesn't exist or can't be read
 */
export async function readFileLines(
  filePath: string,
): Promise<string[] | null> {
  try {
    const content = await readFile(filePath, { encoding: 'utf8' })
    return content.split('\n')
  } catch (e: unknown) {
    if (isFsInaccessible(e)) return null
    throw e
  }
}

/**
 * Write lines back to a file
 */
export async function writeFileLines(
  filePath: string,
  lines: string[],
): Promise<void> {
  const fh = await open(filePath, 'w')
  try {
    await fh.writeFile(lines.join('\n'), { encoding: 'utf8' })
    await fh.datasync()
  } finally {
    await fh.close()
  }
}

/**
 * Check if a gc alias exists in any shell config file
 * Returns the alias target if found, null otherwise
 * @param options Optional overrides for testing (env, homedir)
 */
export async function findCliAlias(
  options?: ShellConfigOptions,
): Promise<string | null> {
  const configs = getShellConfigPaths(options)

  for (const configPath of Object.values(configs)) {
    const lines = await readFileLines(configPath)
    if (!lines) continue

    for (const line of lines) {
      if (CLI_ALIAS_REGEX.test(line)) {
        const target = extractAliasTarget(line, 'gc')
        if (target) {
          return target
        }
      }
    }
  }

  return null
}

/**
 * Check if a gc alias exists and points to a valid executable
 * Returns the alias target if valid, null otherwise
 * @param options Optional overrides for testing (env, homedir)
 */
export async function findValidCliAlias(
  options?: ShellConfigOptions,
): Promise<string | null> {
  const aliasTarget = await findCliAlias(options)
  if (!aliasTarget) return null

  const home = options?.homedir ?? osHomedir()

  // Expand ~ to home directory
  const expandedPath = aliasTarget.startsWith('~')
    ? aliasTarget.replace('~', home)
    : aliasTarget

  // Check if the target exists and is executable
  try {
    const stats = await stat(expandedPath)
    // Check if it's a file (could be executable or symlink)
    if (stats.isFile() || stats.isSymbolicLink()) {
      return aliasTarget
    }
  } catch {
    // Target doesn't exist or can't be accessed
  }

  return null
}
