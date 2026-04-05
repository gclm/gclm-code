import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  getRepoRoot,
  readRootPackage,
} from './lib/single-package-npm.mjs'
import {
  prepareVendorRuntime,
  summarizeVendorWorkspacePackages,
} from './lib/vendor-runtime-modules.mjs'

const rootDir = getRepoRoot(import.meta.url)
const rootPkg = readRootPackage(rootDir)

function parseArgs(argv) {
  const options = {
    packageDir: resolve(rootDir, 'dist', 'single-package', rootPkg.name),
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--package-dir' && argv[i + 1]) {
      options.packageDir = resolve(rootDir, argv[i + 1])
      i += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

const options = parseArgs(process.argv.slice(2))
mkdirSync(resolve(options.packageDir, 'vendor'), { recursive: true })

const result = prepareVendorRuntime({
  rootDir,
  packageDir: options.packageDir,
  rootPkg,
})

process.stdout.write(
  [
    `Prepared vendor runtime modules at ${resolve(options.packageDir, 'vendor', 'modules')}`,
    `- workspace packages: ${summarizeVendorWorkspacePackages().join(', ')}`,
    `- runtime dependencies: ${Object.keys(result.runtimeDependencies).join(', ') || '(none)'}`,
  ].join('\n') + '\n',
)
