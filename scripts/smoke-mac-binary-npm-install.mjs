import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  currentMacArch,
  getRepoRoot,
  MAC_ARCH_PACKAGES,
  npmPackFileName,
  readRootPackage,
  ROOT_PACKAGE_NAME,
} from './lib/mac-binary-npm.mjs'

const rootDir = getRepoRoot(import.meta.url)
const currentArch = currentMacArch()

if (!currentArch) {
  process.stderr.write('SKIP mac-binary-npm-install-smoke - 当前仅在 macOS x64/arm64 环境下执行\n')
  process.exit(0)
}

function parseArgs(argv) {
  const rootPkg = readRootPackage(rootDir)
  const options = {
    stagingDir: resolve(rootDir, 'dist', 'npm-install-smoke'),
    tarballsDir: resolve(rootDir, 'dist', 'npm-install-smoke-tarballs'),
    version: rootPkg.version,
    binaries: {
      x64: resolve(rootDir, 'gc'),
      arm64: resolve(rootDir, 'gc'),
    },
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
    if (arg === '--version' && argv[i + 1]) {
      options.version = argv[i + 1]
      i += 1
      continue
    }
    if (arg === '--darwin-x64-binary' && argv[i + 1]) {
      options.binaries.x64 = resolve(rootDir, argv[i + 1])
      i += 1
      continue
    }
    if (arg === '--darwin-arm64-binary' && argv[i + 1]) {
      options.binaries.arm64 = resolve(rootDir, argv[i + 1])
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
    ...options,
  })

  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    throw new Error(output || `${command} failed`)
  }

  return result
}

const options = parseArgs(process.argv.slice(2))
const tempDir = mkdtempSync(join(tmpdir(), 'gclm-mac-binary-npm-install-'))
const npmCacheDir = join(tempDir, '.npm-cache')

try {
  if (!options.skipPack) {
    run('node', [
      './scripts/prepare-mac-binary-npm.mjs',
      '--output-dir',
      options.stagingDir,
      '--version',
      options.version,
      '--darwin-x64-binary',
      options.binaries.x64,
      '--darwin-arm64-binary',
      options.binaries.arm64,
    ])

    run('node', [
      './scripts/pack-mac-binary-npm.mjs',
      '--staging-dir',
      options.stagingDir,
      '--output-dir',
      options.tarballsDir,
    ])
  }

  const tempProjectDir = join(tempDir, 'project')
  mkdirSync(tempProjectDir, { recursive: true })
  mkdirSync(npmCacheDir, { recursive: true })

  run('npm', ['init', '-y'], { cwd: tempProjectDir })

  const childPackageName = MAC_ARCH_PACKAGES[currentArch].packageName
  const childTarball = join(
    options.tarballsDir,
    npmPackFileName(childPackageName, options.version),
  )
  const rootTarball = join(
    options.tarballsDir,
    npmPackFileName(ROOT_PACKAGE_NAME, options.version),
  )

  run(
    'npm',
    [
      'install',
      '--cache',
      npmCacheDir,
      '--no-package-lock',
      childTarball,
    ],
    { cwd: tempProjectDir },
  )

  run(
    'npm',
    [
      'install',
      '--offline',
      '--cache',
      npmCacheDir,
      '--no-package-lock',
      rootTarball,
    ],
    { cwd: tempProjectDir },
  )

  const versionResult = run(
    join(tempProjectDir, 'node_modules', '.bin', 'gc'),
    ['--version'],
    { cwd: tempProjectDir },
  )

  const output = (versionResult.stdout ?? '').trim()
  if (!output.includes(options.version)) {
    throw new Error(`unexpected gc version output: ${output}`)
  }

  process.stdout.write(
    `PASS mac-binary-npm-install-smoke - arch=${currentArch} version=${output}\n`,
  )
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
