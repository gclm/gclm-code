import { currentMacArch, getRepoRoot, readRootPackage } from './lib/mac-binary-npm.mjs'
import { copyInstalledDependencyTree } from './lib/vendor-runtime-modules.mjs'
import { lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const rootDir = getRepoRoot(import.meta.url)
const rootPkg = readRootPackage(rootDir)
const currentArch = currentMacArch()

if (!currentArch) {
  process.stderr.write(
    'SKIP single-package-runtime-install-smoke - 当前仅在 macOS x64/arm64 环境下执行\n',
  )
  process.exit(0)
}

function parseArgs(argv) {
  const options = {
    stagingDir: resolve(rootDir, 'dist', 'single-package-runtime-smoke'),
    packDir: resolve(rootDir, 'dist', 'single-package-runtime-tarballs'),
    releaseAssetsDir: resolve(rootDir, 'dist', 'single-package-runtime-assets'),
    version: rootPkg.version,
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
    if (arg === '--release-assets-dir' && argv[i + 1]) {
      options.releaseAssetsDir = resolve(rootDir, argv[i + 1])
      i += 1
      continue
    }
    if (arg === '--version' && argv[i + 1]) {
      options.version = argv[i + 1]
      i += 1
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

const options = parseArgs(process.argv.slice(2))
const tempDir = mkdtempSync(join(tmpdir(), 'gclm-single-package-install-'))
const npmCacheDir = join(tempDir, '.npm-cache')

try {
  run('node', [
    './scripts/prepare-mac-release-assets.mjs',
    '--output-dir',
    options.releaseAssetsDir,
    '--version',
    options.version,
  ])

  run('node', [
    './scripts/prepare-single-package-npm.mjs',
    '--output-dir',
    options.stagingDir,
    '--version',
    options.version,
    '--runtime-base-url',
    options.releaseAssetsDir,
  ])

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
    { cwd: join(options.stagingDir, 'gclm-code') },
  )

  const tarballName = `${packResult.stdout ?? ''}`
    .trim()
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .at(-1)

  if (!tarballName) {
    throw new Error('npm pack did not output tarball name')
  }

  const tempInstallDir = join(tempDir, 'install')
  mkdirSync(tempInstallDir, { recursive: true })
  run('tar', ['-xzf', join(options.packDir, tarballName), '-C', tempInstallDir])

  const installedPackageDir = join(tempInstallDir, 'package')
  const installedPackageManifest = JSON.parse(
    readFileSync(join(installedPackageDir, 'package.json'), 'utf8'),
  )

  copyInstalledDependencyTree({
    rootDir,
    targetNodeModulesDir: join(installedPackageDir, 'node_modules'),
    dependencyNames: Object.keys(installedPackageManifest.dependencies ?? {}),
  })

  run('node', ['bin/install-runtime.js', '--package-dir', installedPackageDir], {
    cwd: installedPackageDir,
  })

  const versionResult = run('node', ['bin/gc.js', '--version'], {
    cwd: installedPackageDir,
  })

  const runtimeNodeModulesPath = join(
    installedPackageDir,
    'vendor',
    'runtime',
    `${process.platform}-${process.arch}`,
    'node_modules',
  )
  if (!lstatSync(runtimeNodeModulesPath).isSymbolicLink()) {
    throw new Error('runtime node_modules link was not created')
  }

  const output = `${versionResult.stdout ?? ''}`.trim()
  if (!output.includes(options.version)) {
    throw new Error(`unexpected gc version output: ${output}`)
  }

  process.stdout.write(
    `PASS single-package-runtime-install-smoke - arch=${currentArch} version=${output}\n`,
  )
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
