import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { getRepoRoot, MAC_ARCH_PACKAGES, readRootPackage } from './lib/mac-binary-npm.mjs'

const rootDir = getRepoRoot(import.meta.url)
const rootPkg = readRootPackage(rootDir)

function parseArgs(argv) {
  const options = {
    outputDir: resolve(rootDir, 'release-assets'),
    version: rootPkg.version,
    binaries: {
      x64: null,
      arm64: null,
    },
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
    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function ensureBinary(path, label) {
  if (!path) {
    throw new Error(`Missing binary path for ${label}`)
  }
  if (!existsSync(path)) {
    throw new Error(`Binary for ${label} does not exist: ${path}`)
  }
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
ensureBinary(options.binaries.x64, 'darwin-x64')
ensureBinary(options.binaries.arm64, 'darwin-arm64')

rmSync(options.outputDir, { recursive: true, force: true })
mkdirSync(options.outputDir, { recursive: true })

const stagingRoot = join(options.outputDir, '.staging')
const assets = []

for (const [arch, binaryPath] of [
  ['x64', options.binaries.x64],
  ['arm64', options.binaries.arm64],
]) {
  const meta = MAC_ARCH_PACKAGES[arch]
  const assetBaseName = `gclm-code-${options.version}-${meta.releaseLabel}.tar.gz`
  const assetPath = join(options.outputDir, assetBaseName)
  const checksumPath = join(options.outputDir, `${assetBaseName}.sha256`)
  const stageDir = join(stagingRoot, meta.releaseLabel)
  const binDir = join(stageDir, 'bin')

  mkdirSync(binDir, { recursive: true })
  copyFileSync(binaryPath, join(binDir, 'gc'))
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
