import { accessSync, constants } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'

const DEFAULT_WINDOWS_PATHEXT = ['.COM', '.EXE', '.BAT', '.CMD']

function getWindowsExtensions(command: string): string[] {
  if (command.includes('.')) {
    return ['']
  }

  const pathExt = process.env.PATHEXT
    ?.split(';')
    .map(ext => ext.trim())
    .filter(Boolean)

  return [''].concat(pathExt?.length ? pathExt : DEFAULT_WINDOWS_PATHEXT)
}

function isPathLike(command: string): boolean {
  return (
    command.includes('/') ||
    command.includes('\\') ||
    command === '.' ||
    command === '..'
  )
}

function isExecutable(path: string): boolean {
  try {
    accessSync(
      path,
      process.platform === 'win32' ? constants.F_OK : constants.X_OK,
    )
    return true
  } catch {
    return false
  }
}

function findCommandInPath(command: string): string | null {
  const pathValue = process.env.PATH
  if (!pathValue) {
    return null
  }

  const searchDirectories = pathValue
    .split(delimiter)
    .map(segment => segment || process.cwd())

  for (const directory of searchDirectories) {
    for (const extension of getWindowsExtensions(command)) {
      const candidate = join(directory, `${command}${extension}`)
      if (isExecutable(candidate)) {
        return candidate
      }
    }
  }

  return null
}

function resolvePathLikeCommand(command: string): string | null {
  const candidates =
    process.platform === 'win32'
      ? getWindowsExtensions(command).map(extension => `${command}${extension}`)
      : [command]

  for (const candidate of candidates) {
    const resolved = isAbsolute(candidate) ? candidate : join(process.cwd(), candidate)
    if (isExecutable(resolved)) {
      return resolved
    }
  }

  return null
}

function whichSyncInternal(command: string): string | null {
  if (!command.trim()) {
    return null
  }

  if (isPathLike(command)) {
    return resolvePathLikeCommand(command)
  }

  return findCommandInPath(command)
}

/**
 * Finds the full path to a command executable.
 * Uses Bun.which when running in Bun (fast, no process spawn),
 * otherwise spawns the platform-appropriate command.
 *
 * @param command - The command name to look up
 * @returns The full path to the command, or null if not found
 */
export const which = async (command: string): Promise<string | null> =>
  whichSyncInternal(command)

/**
 * Synchronous version of `which`.
 *
 * @param command - The command name to look up
 * @returns The full path to the command, or null if not found
 */
export const whichSync = (command: string): string | null =>
  whichSyncInternal(command)
