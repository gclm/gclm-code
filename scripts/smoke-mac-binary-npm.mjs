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
  consumePlatformBinaryArg,
  createBinaryPathOverrides,
  resolvePlatformBinaryPaths,
} from './lib/release-platforms.mjs'
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
const LEGACY_BINARY_FLAGS = Object.freeze({
  '--darwin-x64-binary': 'darwin-x64',
  '--darwin-arm64-binary': 'darwin-arm64',
})

if (!currentArch) {
  process.stderr.write('SKIP mac-binary-npm-smoke - 当前仅在 macOS x64/arm64 环境下执行\n')
  process.exit(0)
}

function parseArgs(argv) {
  const rootPkg = readRootPackage(rootDir)
  const options = {
    stagingDir: resolve(rootDir, 'dist', 'npm-smoke'),
    version: rootPkg.version,
    binaryInputDir: null,
    binaries: createBinaryPathOverrides(),
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
    if (arg === '--binary-input-dir' && argv[i + 1]) {
      options.binaryInputDir = argv[i + 1]
      i += 1
      continue
    }
    const consumed = consumePlatformBinaryArg({
      argv,
      index: i,
      binaries: options.binaries,
      rootDir,
      aliasMap: LEGACY_BINARY_FLAGS,
    })
    if (consumed > 0) {
      i += consumed
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
const binaries = resolvePlatformBinaryPaths({
  rootDir,
  binaries: options.binaries,
  binaryInputDir: options.binaryInputDir,
})
const tempDir = mkdtempSync(join(tmpdir(), 'gclm-mac-binary-npm-'))
const npmCacheDir = join(tempDir, '.npm-cache')

try {
  if (!options.skipPrepare) {
    process.stdout.write(
      `NOTE mac-binary-npm-smoke - 当前仅校验 ${currentArch} 启动链路；未显式传入双架构二进制时会复用本机 ./gc 作为 staging 占位产物\n`,
    )
    run('node', [
      './scripts/prepare-mac-binary-npm.mjs',
      '--output-dir',
      options.stagingDir,
      '--version',
      options.version,
      '--binary',
      `darwin-x64=${binaries['darwin-x64']}`,
      '--binary',
      `darwin-arm64=${binaries['darwin-arm64']}`,
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
