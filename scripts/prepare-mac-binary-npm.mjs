import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import {
  ACTIVE_BINARY_NPM_PLATFORM_IDS,
  consumePlatformBinaryArg,
  createBinaryPathOverrides,
  ensurePlatformBinaries,
  getBinaryNpmReleasePlatforms,
  ROOT_PACKAGE_NAME,
  resolvePlatformBinaryPaths,
} from './lib/release-platforms.mjs'
import {
  getRepoRoot,
  readRootPackage,
  renderRootLauncher,
} from './lib/mac-binary-npm.mjs'

const rootDir = getRepoRoot(import.meta.url)
const rootPkg = readRootPackage(rootDir)
const LEGACY_BINARY_FLAGS = Object.freeze({
  '--darwin-x64-binary': 'darwin-x64',
  '--darwin-arm64-binary': 'darwin-arm64',
})

function parseArgs(argv) {
  const options = {
    outputDir: resolve(rootDir, 'dist', 'npm'),
    version: rootPkg.version,
    binaryInputDir: null,
    binaries: createBinaryPathOverrides(ACTIVE_BINARY_NPM_PLATFORM_IDS),
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

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function writeText(path, value, executable = false) {
  writeFileSync(path, value)
  if (executable) {
    chmodSync(path, 0o755)
  }
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true })
}

function rootOptionalDependencies(options) {
  const specs = {}
  for (const platform of getBinaryNpmReleasePlatforms()) {
    specs[platform.packageName] = options.version
  }
  return specs
}

function writeRootPackage(outputDir, options) {
  const packageDir = join(outputDir, ROOT_PACKAGE_NAME)
  const binDir = join(packageDir, 'bin')
  ensureDir(binDir)
  const platforms = getBinaryNpmReleasePlatforms()
  const supportedOs = [...new Set(platforms.map(platform => platform.os))]
  const supportedCpu = [...new Set(platforms.map(platform => platform.arch))]

  const manifest = {
    name: ROOT_PACKAGE_NAME,
    version: options.version,
    private: false,
    description: 'Binary launcher package for Gclm Code.',
    type: 'module',
    license: rootPkg.license ?? 'UNLICENSED',
    os: supportedOs,
    cpu: supportedCpu,
    bin: {
      gc: './bin/gc.js',
      claude: './bin/gc.js',
    },
    optionalDependencies: rootOptionalDependencies(options),
    files: [
      'bin',
      'README.md',
    ],
  }

  writeJson(join(packageDir, 'package.json'), manifest)
  writeText(join(binDir, 'gc.js'), renderRootLauncher(), true)
  writeText(
    join(packageDir, 'README.md'),
    '# gclm-code\n\nGenerated binary launcher package.\n',
  )
}

function writePlatformPackage(outputDir, platform, binaryPath, version) {
  const packageDir = join(outputDir, platform.packageName)
  const binDir = join(packageDir, 'bin')
  const resourcesDir = join(packageDir, 'resources')
  ensureDir(binDir)
  ensureDir(resourcesDir)

  const targetBinaryPath = join(binDir, 'gc')
  copyFileSync(binaryPath, targetBinaryPath)
  chmodSync(targetBinaryPath, 0o755)

  const manifest = {
    name: platform.packageName,
    version,
    private: false,
    description: platform.description,
    type: 'module',
    license: rootPkg.license ?? 'UNLICENSED',
    os: [platform.os],
    cpu: [platform.arch],
    files: [
      'bin',
      'resources',
      'README.md',
    ],
  }

  writeJson(join(packageDir, 'package.json'), manifest)
  writeText(
    join(packageDir, 'README.md'),
    `# ${platform.packageName}\n\nGenerated ${platform.releaseLabel} binary package for Gclm Code.\n`,
  )
}

const options = parseArgs(process.argv.slice(2))
const binaries = resolvePlatformBinaryPaths({
  rootDir,
  binaries: options.binaries,
  binaryInputDir: options.binaryInputDir,
})
ensurePlatformBinaries(binaries)

rmSync(options.outputDir, { recursive: true, force: true })
ensureDir(options.outputDir)

writeRootPackage(options.outputDir, options)
for (const platform of getBinaryNpmReleasePlatforms()) {
  writePlatformPackage(
    options.outputDir,
    platform,
    binaries[platform.platformId],
    options.version,
  )
}

process.stdout.write(
  [
    `Prepared mac binary npm packages at ${options.outputDir}`,
    `- ${ROOT_PACKAGE_NAME}`,
    ...getBinaryNpmReleasePlatforms().map(platform => `- ${platform.packageName}`),
  ].join('\n') + '\n',
)
