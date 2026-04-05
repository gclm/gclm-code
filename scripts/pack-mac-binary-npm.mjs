import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import {
  getMacPackageDirectoryNames,
  getRepoRoot,
} from './lib/mac-binary-npm.mjs'

const rootDir = getRepoRoot(import.meta.url)

function parseArgs(argv) {
  const options = {
    stagingDir: resolve(rootDir, 'dist', 'npm'),
    outputDir: resolve(rootDir, 'dist', 'npm-tarballs'),
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

rmSync(options.outputDir, { recursive: true, force: true })
mkdirSync(options.outputDir, { recursive: true })
const npmCacheDir = join(options.outputDir, '.npm-cache')
mkdirSync(npmCacheDir, { recursive: true })

const tarballs = []
for (const dirName of getMacPackageDirectoryNames()) {
  const packageDir = join(options.stagingDir, dirName)
  if (!existsSync(packageDir)) {
    throw new Error(`Missing staged package directory: ${packageDir}`)
  }

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
    throw new Error(`npm pack did not report tarball name for ${dirName}`)
  }

  tarballs.push(join(options.outputDir, tarballName))
}

process.stdout.write(
  `Packed mac binary npm tarballs at ${options.outputDir}\n${tarballs
    .map(path => `- ${path}`)
    .join('\n')}\n`,
)
