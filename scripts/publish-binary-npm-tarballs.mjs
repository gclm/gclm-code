import { existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { getRepoRoot, npmPackFileName, readRootPackage } from './lib/mac-binary-npm.mjs'
import { getBinaryPackagePublishOrder } from './lib/release-platforms.mjs'

const rootDir = getRepoRoot(import.meta.url)
const rootPkg = readRootPackage(rootDir)

function parseArgs(argv) {
  const options = {
    tarballsDir: resolve(rootDir, 'dist', 'npm-tarballs'),
    version: rootPkg.version,
    npmTag: 'latest',
    access: 'public',
    dryRun: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
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
    if (arg === '--npm-tag' && argv[i + 1]) {
      options.npmTag = argv[i + 1]
      i += 1
      continue
    }
    if (arg === '--access' && argv[i + 1]) {
      options.access = argv[i + 1]
      i += 1
      continue
    }
    if (arg === '--dry-run') {
      options.dryRun = true
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: 'pipe',
    env: process.env,
  })

  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    throw new Error(output || `${command} failed`)
  }
}

const options = parseArgs(process.argv.slice(2))
const publishOrder = getBinaryPackagePublishOrder()

for (const packageName of publishOrder) {
  const tarballPath = join(
    options.tarballsDir,
    npmPackFileName(packageName, options.version),
  )
  if (!existsSync(tarballPath)) {
    throw new Error(`Missing tarball for ${packageName}: ${tarballPath}`)
  }

  const publishArgs = [
    'publish',
    '--access',
    options.access,
    '--tag',
    options.npmTag,
    tarballPath,
  ]

  if (options.dryRun) {
    process.stdout.write(`DRY RUN npm ${publishArgs.join(' ')}\n`)
    continue
  }

  run('npm', publishArgs)
  process.stdout.write(`Published ${packageName}\n`)
}
