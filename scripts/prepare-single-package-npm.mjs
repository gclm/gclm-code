import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  copyVendorLauncher,
  createSinglePackageManifest,
  createVendorManifest,
  getRepoRoot,
  readRootPackage,
  renderSinglePackageReadme,
  ROOT_PACKAGE_NAME,
} from './lib/single-package-npm.mjs'

const rootDir = getRepoRoot(import.meta.url)
const rootPkg = readRootPackage(rootDir)

function parseArgs(argv) {
  const options = {
    outputDir: resolve(rootDir, 'dist', 'single-package'),
    version: rootPkg.version,
    runtimeBaseUrl: null,
    releaseTag: null,
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
    if (arg === '--runtime-base-url' && argv[i + 1]) {
      options.runtimeBaseUrl = argv[i + 1]
      i += 1
      continue
    }
    if (arg === '--release-tag' && argv[i + 1]) {
      options.releaseTag = argv[i + 1]
      i += 1
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

const options = parseArgs(process.argv.slice(2))
const packageDir = join(options.outputDir, ROOT_PACKAGE_NAME)
const binDir = join(packageDir, 'bin')
const vendorDir = join(packageDir, 'vendor')

rmSync(options.outputDir, { recursive: true, force: true })
mkdirSync(binDir, { recursive: true })
mkdirSync(vendorDir, { recursive: true })

writeJson(
  join(packageDir, 'package.json'),
  createSinglePackageManifest({
    rootPkg,
    version: options.version,
  }),
)

copyVendorLauncher({
  rootDir,
  targetPath: join(binDir, 'gc.js'),
})
chmodSync(join(binDir, 'gc.js'), 0o755)

writeJson(
  join(vendorDir, 'manifest.json'),
  createVendorManifest({
    version: options.version,
    runtimeBaseUrl: options.runtimeBaseUrl,
    releaseTag: options.releaseTag ?? `v${options.version}`,
  }),
)

writeFileSync(
  join(packageDir, 'README.md'),
  renderSinglePackageReadme(options.version),
)

process.stdout.write(
  [
    `Prepared single-package npm staging at ${packageDir}`,
    '- package.json',
    '- bin/gc.js',
    '- vendor/manifest.json',
  ].join('\n') + '\n',
)
