import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  getRepoRoot,
  readRootPackage,
  ROOT_PACKAGE_NAME,
} from './lib/single-package-npm.mjs'

const rootDir = getRepoRoot(import.meta.url)
const rootPkg = readRootPackage(rootDir)

function parseArgs(argv) {
  const options = {
    stagingDir: resolve(rootDir, 'dist', 'single-package-smoke'),
    packDir: resolve(rootDir, 'dist', 'single-package-smoke-tarballs'),
    version: rootPkg.version,
    skipPrepare: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--staging-dir' && argv[i + 1]) {
      options.stagingDir = resolve(rootDir, argv[i + 1])
      i += 1
      continue
    }
    if (arg === '--pack-dir' && argv[i + 1]) {
      options.packDir = resolve(rootDir, argv[i + 1])
      i += 1
      continue
    }
    if (arg === '--version' && argv[i + 1]) {
      options.version = argv[i + 1]
      i += 1
      continue
    }
    if (arg === '--skip-prepare') {
      options.skipPrepare = true
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? rootDir,
    encoding: 'utf8',
    stdio: 'pipe',
    ...options,
  })

  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    throw new Error(output || `${command} failed`)
  }

  return result
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const options = parseArgs(process.argv.slice(2))
const packageDir = join(options.stagingDir, ROOT_PACKAGE_NAME)
const packageJsonPath = join(packageDir, 'package.json')
const launcherPath = join(packageDir, 'bin', 'gc.js')
const vendorManifestPath = join(packageDir, 'vendor', 'manifest.json')
const vendorModulesPath = join(packageDir, 'vendor', 'modules', 'node_modules')
const tempDir = mkdtempSync(join(tmpdir(), 'gclm-single-package-smoke-'))
const npmCacheDir = join(tempDir, '.npm-cache')

try {
  if (!options.skipPrepare) {
    run('node', [
      './scripts/prepare-single-package-npm.mjs',
      '--output-dir',
      options.stagingDir,
      '--version',
      options.version,
    ])
  }

  assert(existsSync(packageJsonPath), `missing package.json: ${packageJsonPath}`)
  assert(existsSync(launcherPath), `missing launcher: ${launcherPath}`)
  assert(
    existsSync(vendorManifestPath),
    `missing vendor manifest: ${vendorManifestPath}`,
  )
  assert(existsSync(vendorModulesPath), `missing vendor modules: ${vendorModulesPath}`)

  const packageManifest = JSON.parse(readFileSync(packageJsonPath, 'utf8'))
  assert(packageManifest.name === ROOT_PACKAGE_NAME, 'unexpected package name')
  assert(
    Array.isArray(packageManifest.files) &&
      packageManifest.files.join(',') === 'bin,vendor,README.md',
    'unexpected package files whitelist',
  )

  const vendorManifest = JSON.parse(readFileSync(vendorManifestPath, 'utf8'))
  assert(vendorManifest.version === options.version, 'unexpected vendor manifest version')
  assert(
    vendorManifest?.modules?.nodePath === 'vendor/modules/node_modules',
    'unexpected vendor modules nodePath',
  )
  assert(
    Object.keys(vendorManifest?.modules?.workspacePackages ?? {}).length === 8,
    'unexpected vendor workspace package count',
  )
  assert(
    vendorManifest?.runtime?.platforms?.['darwin-x64'],
    'missing darwin-x64 runtime entry',
  )
  assert(
    vendorManifest?.runtime?.platforms?.['darwin-arm64'],
    'missing darwin-arm64 runtime entry',
  )
  assert(
    Object.keys(packageManifest.dependencies ?? {}).length > 0,
    'single-package manifest missing runtime dependencies',
  )
  assert(
    packageManifest.dependencies?.sharp === vendorManifest?.modules?.externalDependencies?.sharp,
    'single-package manifest dependencies out of sync with vendor manifest',
  )

  mkdirSync(options.packDir, { recursive: true })
  mkdirSync(npmCacheDir, { recursive: true })

  const packResult = run(
    'npm',
    [
      'pack',
      '--silent',
      `--cache=${npmCacheDir}`,
      `--pack-destination=${options.packDir}`,
    ],
    { cwd: packageDir },
  )

  const tarballName = `${packResult.stdout ?? ''}`
    .trim()
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .at(-1)
  assert(tarballName, 'npm pack did not output tarball name')

  const tarballPath = join(options.packDir, tarballName)
  assert(existsSync(tarballPath), `missing tarball: ${tarballPath}`)

  const tarList = run('tar', ['-tf', tarballPath])
  const tarEntries = `${tarList.stdout ?? ''}`.split(/\r?\n/).filter(Boolean)
  assert(
    tarEntries.includes('package/bin/gc.js'),
    'tarball does not contain package/bin/gc.js',
  )
  assert(
    tarEntries.includes('package/vendor/manifest.json'),
    'tarball does not contain package/vendor/manifest.json',
  )
  assert(
    tarEntries.includes('package/vendor/modules/node_modules/audio-capture-napi/package.json'),
    'tarball does not contain vendored workspace packages',
  )

  const launcherResult = spawnSync('node', ['bin/gc.js', '--version'], {
    cwd: packageDir,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  assert(launcherResult.status !== 0, 'launcher should not succeed before runtime install')

  const launcherOutput = `${launcherResult.stdout ?? ''}${launcherResult.stderr ?? ''}`
  const matchedExpectedFailure =
    launcherOutput.includes('当前平台 runtime 未就绪') ||
    launcherOutput.includes('当前暂不支持平台组合')
  assert(matchedExpectedFailure, `unexpected launcher output: ${launcherOutput.trim()}`)

  process.stdout.write(
    `PASS single-package-npm-smoke - version=${options.version} tarball=${tarballName}\n`,
  )
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
