import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import {
  consumePlatformBinaryArg,
  createBinaryPathOverrides,
  ensurePlatformBinaries,
  getBinaryNpmReleasePlatforms,
  resolvePlatformBinaryPaths,
} from './lib/release-platforms.mjs'
import { getRepoRoot, readRootPackage } from './lib/mac-binary-npm.mjs'

const rootDir = getRepoRoot(import.meta.url)
const rootPkg = readRootPackage(rootDir)
const LEGACY_BINARY_FLAGS = Object.freeze({
  '--darwin-x64-binary': 'darwin-x64',
  '--darwin-arm64-binary': 'darwin-arm64',
})

function parseArgs(argv) {
  const options = {
    outputDir: resolve(rootDir, 'release-assets'),
    version: rootPkg.version,
    binaryInputDir: null,
    binaries: createBinaryPathOverrides(),
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--output-dir' && argv[i + 1]) {
      options.outputDir = resolve(rootDir, argv[i + 1])
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
}

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

const options = parseArgs(process.argv.slice(2))
const binaries = resolvePlatformBinaryPaths({
  rootDir,
  binaries: options.binaries,
  binaryInputDir: options.binaryInputDir,
})
ensurePlatformBinaries(binaries)

rmSync(options.outputDir, { recursive: true, force: true })
mkdirSync(options.outputDir, { recursive: true })

const stagingRoot = join(options.outputDir, '.staging')
const assets = []

for (const platform of getBinaryNpmReleasePlatforms()) {
  const assetBaseName = `gclm-code-${options.version}-${platform.releaseLabel}.tar.gz`
  const assetPath = join(options.outputDir, assetBaseName)
  const checksumPath = join(options.outputDir, `${assetBaseName}.sha256`)
  const stageDir = join(stagingRoot, platform.releaseLabel)
  const binDir = join(stageDir, 'bin')

  mkdirSync(binDir, { recursive: true })
  copyFileSync(binaries[platform.platformId], join(binDir, 'gc'))
  chmodSync(join(binDir, 'gc'), 0o755)
  symlinkSync('gc', join(binDir, 'claude'))

  run('tar', ['-czf', assetPath, '-C', stageDir, 'bin'])

  writeFileSync(checksumPath, `${sha256(assetPath)}  ${assetBaseName}\n`)
  assets.push(assetPath, checksumPath)
}

rmSync(stagingRoot, { recursive: true, force: true })

process.stdout.write(
  `Prepared mac release assets at ${options.outputDir}\n${assets
    .map(path => `- ${path}`)
    .join('\n')}\n`,
)
