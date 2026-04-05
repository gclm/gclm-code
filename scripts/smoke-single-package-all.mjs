import { spawnSync } from 'node:child_process'
import { getRepoRoot } from './lib/single-package-npm.mjs'

const rootDir = getRepoRoot(import.meta.url)

function parseArgs(argv) {
  const options = {
    withRegistry: false,
  }

  for (const arg of argv) {
    if (arg === '--with-registry') {
      options.withRegistry = true
      continue
    }

    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function runStep(name, scriptPath) {
  process.stdout.write(`\n== ${name} ==\n`)

  const result = spawnSync('node', [scriptPath], {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env,
  })

  if (result.status !== 0) {
    throw new Error(`${name} failed with ${String(result.status ?? result.signal ?? 'unknown')}`)
  }
}

const options = parseArgs(process.argv.slice(2))
const steps = [
  ['single-package-staging', './scripts/smoke-single-package-npm.mjs'],
  ['single-package-install', './scripts/smoke-single-package-npm-install.mjs'],
  ['single-package-vendor', './scripts/smoke-single-package-vendor-modules.mjs'],
]

if (options.withRegistry) {
  steps.push([
    'single-package-registry',
    './scripts/smoke-single-package-npm-registry.mjs',
  ])
}

for (const [name, scriptPath] of steps) {
  runStep(name, scriptPath)
}

process.stdout.write(
  `\nPASS single-package-smoke-suite - mode=${options.withRegistry ? 'with-registry' : 'local'}\n`,
)
