import {
  chmodSync,
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  rmSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  currentMacArch,
  getMacPackageDirectoryNames,
  getRepoRoot,
  MAC_ARCH_PACKAGES,
  readRootPackage,
  ROOT_PACKAGE_NAME,
} from './lib/mac-binary-npm.mjs'

const rootDir = getRepoRoot(import.meta.url)
const currentArch = currentMacArch()

if (!currentArch) {
  process.stderr.write('SKIP mac-binary-npm-smoke - 当前仅在 macOS x64/arm64 环境下执行\n')
  process.exit(0)
}

function parseArgs(argv) {
  const rootPkg = readRootPackage(rootDir)
  const options = {
    stagingDir: resolve(rootDir, 'dist', 'npm-smoke'),
    version: rootPkg.version,
    binaries: {
      x64: resolve(rootDir, 'gc'),
      arm64: resolve(rootDir, 'gc'),
    },
    skipPrepare: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--staging-dir' && argv[i + 1]) {
      options.stagingDir = resolve(rootDir, argv[i + 1])
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

const options = parseArgs(process.argv.slice(2))
const tempDir = mkdtempSync(join(tmpdir(), 'gclm-mac-binary-npm-'))
const npmCacheDir = join(tempDir, '.npm-cache')

try {
  if (!options.skipPrepare) {
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
  }

  const packageDirs = getMacPackageDirectoryNames()
  for (const dirName of packageDirs) {
    run('npm', ['pack', '--silent', `--cache=${npmCacheDir}`], {
      cwd: join(options.stagingDir, dirName),
    })
  }

  const installedNodeModules = join(tempDir, 'node_modules')
  const installedRootDir = join(installedNodeModules, ROOT_PACKAGE_NAME)
  const installedRootPkg = join(installedRootDir, 'package.json')
  mkdirSync(installedNodeModules, { recursive: true })
  cpSync(join(options.stagingDir, ROOT_PACKAGE_NAME), installedRootDir, {
    recursive: true,
  })

  if (!existsSync(installedRootPkg)) {
    throw new Error(`installed root package missing: ${installedRootPkg}`)
  }

  const nestedNodeModules = join(installedRootDir, 'node_modules')
  mkdirSync(nestedNodeModules, { recursive: true })
  const childPackageName = MAC_ARCH_PACKAGES[currentArch].packageName
  cpSync(
    join(options.stagingDir, childPackageName),
    join(nestedNodeModules, childPackageName),
    { recursive: true },
  )

  const expectedChildPkg = join(nestedNodeModules, childPackageName, 'bin', 'gc')
  if (!existsSync(expectedChildPkg)) {
    throw new Error(`installed arch binary missing: ${expectedChildPkg}`)
  }
  chmodSync(expectedChildPkg, 0o755)

  const versionResult = run(
    'node',
    [join(installedRootDir, 'bin', 'gc.js'), '--version'],
    { cwd: tempDir },
  )
  const output = (versionResult.stdout ?? '').trim()
  if (!output.includes(options.version)) {
    throw new Error(`unexpected gc version output: ${output}`)
  }

  process.stdout.write(
    `PASS mac-binary-npm-smoke - arch=${currentArch} version=${output}\n`,
  )
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
