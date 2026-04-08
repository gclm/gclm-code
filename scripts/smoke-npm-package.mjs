import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = resolve(__dirname, '..')

function readRootPackage() {
  return JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'))
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? rootDir,
    encoding: 'utf8',
    stdio: 'pipe',
    env: options.env ?? process.env,
  })

  return {
    ...result,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function expectOk(label, command, args, validate, options) {
  const result = run(command, args, options)
  process.stdout.write(`\n== ${label}: ${[command, ...args].join(' ')} ==\n`)
  process.stdout.write(`exit: ${String(result.status ?? result.signal ?? 'unknown')}\n`)
  if (result.stdout.trim()) process.stdout.write(`${result.stdout.trim()}\n`)
  if (result.stderr.trim()) process.stdout.write(`${result.stderr.trim()}\n`)

  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${label} failed with exit code ${result.status}`)
  if (validate && !validate(result)) throw new Error(`${label} produced unexpected output`)
}

const rootPkg = readRootPackage()
const tarballDir = resolve(rootDir, 'dist', 'npm-tarballs')
const tarballName = `gclm-code-${rootPkg.version}.tgz`
const tarballPath = join(tarballDir, tarballName)

// Phase 1: Verify staging
assert(existsSync(tarballPath), `Missing tarball: ${tarballPath}. Run \`node scripts/pack-npm.mjs\` first.`)

const tarList = run('tar', ['-tf', tarballPath])
const tarEntries = `${tarList.stdout}`.split(/\r?\n/).filter(Boolean)

process.stdout.write(`\n== tarball contents (${tarEntries.length} entries) ==\n`)
for (const entry of tarEntries.sort()) {
  process.stdout.write(`  ${entry}\n`)
}

assert(tarEntries.includes('package/cli.js'), 'tarball missing cli.js')
assert(tarEntries.includes('package/package.json'), 'tarball missing package.json')

const forbidden = ['package/src/', 'package/tests/', 'package/references/', 'package/scripts/', 'package/packages/', 'package/dist/']
for (const prefix of forbidden) {
  assert(!tarEntries.some(e => e.startsWith(prefix)), `tarball contains forbidden path: ${prefix}`)
}

// Phase 2: Install and verify
const tempDir = mkdtempSync(join(tmpdir(), 'gclm-npm-package-smoke-'))
const npmCacheDir = join(tempDir, '.npm-cache')

try {
  mkdirSync(npmCacheDir, { recursive: true })

  run('npm', ['init', '-y'], { cwd: tempDir })
  run('npm', ['install', tarballPath, `--cache=${npmCacheDir}`], { cwd: tempDir })

  const installedDir = join(tempDir, 'node_modules', 'gclm-code')
  assert(existsSync(installedDir), `package not installed at ${installedDir}`)

  const installedManifest = JSON.parse(readFileSync(join(installedDir, 'package.json'), 'utf8'))
  assert(installedManifest.name === 'gclm-code', `unexpected name: ${installedManifest.name}`)
  assert(installedManifest.version === rootPkg.version, `unexpected version: ${installedManifest.version}`)
  assert(Object.keys(installedManifest.dependencies ?? {}).length === 0, 'expected zero dependencies')

  const gcBin = join(tempDir, 'node_modules', '.bin', 'gc')
  const claudeBin = join(tempDir, 'node_modules', '.bin', 'claude')
  const gclmBin = join(tempDir, 'node_modules', '.bin', 'gclm')

  assert(!existsSync(gclmBin), 'gclm bin should not be installed')

  expectOk('gc --version', gcBin, ['--version'], result =>
    result.stdout.includes('(Gclm Code)'),
  )

  expectOk('gc --help', gcBin, ['--help'], result =>
    result.stdout.includes('Usage: gc'),
  )

  expectOk('gc agents', gcBin, ['agents'], () => true)

  expectOk('gc plugin list', gcBin, ['plugin', 'list'], () => true)

  expectOk('gc mcp list', gcBin, ['mcp', 'list'], () => true)

  expectOk('claude --version (compat)', claudeBin, ['--version'], result =>
    result.stdout.includes('(Gclm Code)'),
  )

  expectOk('claude agents (compat)', claudeBin, ['agents'], () => true)

  expectOk('claude --help (compat)', claudeBin, ['--help'], result =>
    result.stdout.includes('Usage: gc'),
  )

  expectOk('claude plugin list (compat)', claudeBin, ['plugin', 'list'], () => true)

  expectOk('claude mcp list (compat)', claudeBin, ['mcp', 'list'], () => true)

  process.stdout.write('\nAll npm package smoke tests passed.\n')
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
