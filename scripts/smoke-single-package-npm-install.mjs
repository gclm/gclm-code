import { lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { currentMacArch, getRepoRoot, readRootPackage } from './lib/mac-binary-npm.mjs'
import {
  ROOT_PACKAGE_NAME,
  singlePackageTarballName,
} from './lib/single-package-npm.mjs'
import { copyInstalledDependencyTree } from './lib/vendor-runtime-modules.mjs'

const rootDir = getRepoRoot(import.meta.url)
const rootPkg = readRootPackage(rootDir)
const currentArch = currentMacArch()

if (!currentArch) {
  process.stderr.write(
    'SKIP single-package-npm-install-smoke - 当前仅在 macOS x64/arm64 环境下执行\n',
  )
  process.exit(0)
}

function parseArgs(argv) {
  const options = {
    stagingDir: resolve(rootDir, 'dist', 'single-package-install-smoke'),
    tarballsDir: resolve(rootDir, 'dist', 'single-package-install-tarballs'),
    releaseAssetsDir: resolve(rootDir, 'dist', 'single-package-install-assets'),
    version: rootPkg.version,
    skipPack: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--staging-dir' && argv[i + 1]) {
      options.stagingDir = resolve(rootDir, argv[i + 1])
      i += 1
      continue
    }
    if (arg === '--tarballs-dir' && argv[i + 1]) {
      options.tarballsDir = resolve(rootDir, argv[i + 1])
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
    if (arg === '--skip-pack') {
      options.skipPack = true
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
    env: options.env ?? process.env,
  })

  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    throw new Error(output || `${command} failed`)
  }

  return result
}

const options = parseArgs(process.argv.slice(2))
const tempDir = mkdtempSync(join(tmpdir(), 'gclm-single-package-npm-install-'))

try {
  if (!options.skipPack) {
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
    ])

    run('node', [
      './scripts/pack-single-package-npm.mjs',
      '--staging-dir',
      options.stagingDir,
      '--output-dir',
      options.tarballsDir,
    ])
  }

  const tarballPath = join(
    options.tarballsDir,
    singlePackageTarballName(options.version, ROOT_PACKAGE_NAME),
  )
  const extractDir = join(tempDir, 'install')
  mkdirSync(extractDir, { recursive: true })
  run('tar', ['-xzf', tarballPath, '-C', extractDir])

  const installedPackageDir = join(extractDir, 'package')
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
    env: {
      ...process.env,
      GCLM_BINARY_BASE_URL: options.releaseAssetsDir,
    },
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
    `PASS single-package-npm-install-smoke - arch=${currentArch} version=${output}\n`,
  )
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
