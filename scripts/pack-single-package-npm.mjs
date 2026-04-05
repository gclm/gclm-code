import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import {
  getRepoRoot,
  npmPackFileName,
  readRootPackage,
  ROOT_PACKAGE_NAME,
} from './lib/single-package-npm.mjs'

const rootDir = getRepoRoot(import.meta.url)
const rootPkg = readRootPackage(rootDir)

function parseArgs(argv) {
  const options = {
    stagingDir: resolve(rootDir, 'dist', 'single-package'),
    outputDir: resolve(rootDir, 'dist', 'single-package-tarballs'),
    version: rootPkg.version,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--staging-dir' && argv[i + 1]) {
      options.stagingDir = resolve(rootDir, argv[i + 1])
      i += 1
      continue
    }
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
const packageDir = join(options.stagingDir, ROOT_PACKAGE_NAME)

if (!existsSync(packageDir)) {
  throw new Error(`Missing staged package directory: ${packageDir}`)
}

rmSync(options.outputDir, { recursive: true, force: true })
mkdirSync(options.outputDir, { recursive: true })
const npmCacheDir = join(options.outputDir, '.npm-cache')
mkdirSync(npmCacheDir, { recursive: true })

const packResult = run(
  'npm',
  [
    'pack',
    '--silent',
    `--cache=${npmCacheDir}`,
    `--pack-destination=${options.outputDir}`,
  ],
  {
    cwd: packageDir,
  },
)

const tarballName = `${packResult.stdout ?? ''}`
  .trim()
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean)
  .at(-1)

if (!tarballName) {
  throw new Error(`npm pack did not report tarball name for ${ROOT_PACKAGE_NAME}`)
}

const expectedTarballName = npmPackFileName(ROOT_PACKAGE_NAME, options.version)
if (tarballName !== expectedTarballName) {
  throw new Error(
    `Unexpected tarball name: expected=${expectedTarballName} actual=${tarballName}`,
  )
}

process.stdout.write(
  `Packed single-package npm tarball at ${join(options.outputDir, tarballName)}\n`,
)
