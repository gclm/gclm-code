import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

export const root = join(import.meta.dir, '..', '..')
export const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
  version: string
}
const CLI_SPAWN_TIMEOUT_MS = 30_000
const builtCliBundle = join(root, 'dist', 'cli.js')
const sourceCliEntrypoint = './src/entrypoints/cli.tsx'
const devPreload = './scripts/dev-preload.mjs'
const versionFlags = new Set(['--version', '-v', '-V'])

function buildEnv(overrides: Record<string, string> = {}) {
  return Object.fromEntries(
    Object.entries({
      ...process.env,
      NODE_ENV: 'production',
      USER_TYPE: 'external',
      CLAUDE_CODE_SIMPLE: '1',
      CLAUDE_CODE_DISABLE_BACKGROUND_TASKS: '1',
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
      DISABLE_AUTOUPDATER: '1',
      ...overrides,
    }).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  )
}

function spawnCli(args: string[], env: Record<string, string>) {
  const useBuiltBundle =
    args.length > 0 &&
    !args.every(arg => versionFlags.has(arg)) &&
    existsSync(builtCliBundle)

  const command = useBuiltBundle
    ? ['bun', builtCliBundle, ...args]
    : ['bun', '--preload', devPreload, sourceCliEntrypoint, ...args]

  const result = Bun.spawnSync(
    command,
    {
      cwd: root,
      env,
      stdin: 'ignore',
      timeout: CLI_SPAWN_TIMEOUT_MS,
    },
  )

  return {
    exitCode: result.exitCode,
    stdout: new TextDecoder().decode(result.stdout),
    stderr: new TextDecoder().decode(result.stderr),
  }
}

export function runCli(args: string[], envOverrides: Record<string, string> = {}) {
  return spawnCli(args, buildEnv(envOverrides))
}

export function runCliIsolated(
  args: string[],
  envOverrides: Record<string, string> = {},
) {
  const home = mkdtempSync(join(tmpdir(), 'gclm-code-test-home-'))
  try {
    return spawnCli(args, buildEnv({
      HOME: home,
      XDG_CONFIG_HOME: join(home, '.config'),
      XDG_CACHE_HOME: join(home, '.cache'),
      ...envOverrides,
    }))
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
}
