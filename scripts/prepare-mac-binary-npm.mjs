import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { join, resolve } from 'node:path'
import {
  MAC_ARCH_PACKAGES,
  ROOT_PACKAGE_NAME,
  getRepoRoot,
  readRootPackage,
  renderRootLauncher,
} from './lib/mac-binary-npm.mjs'

const rootDir = getRepoRoot(import.meta.url)
const rootPkg = readRootPackage(rootDir)

function parseArgs(argv) {
  const options = {
    outputDir: resolve(rootDir, 'dist', 'npm'),
    version: rootPkg.version,
    localLinks: false,
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
    if (arg === '--local-links') {
      options.localLinks = true
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
  for (const [arch, meta] of Object.entries(MAC_ARCH_PACKAGES)) {
    specs[meta.packageName] = options.localLinks
      ? `file:../${meta.packageName}`
      : options.version
  }
  return specs
}

function writeRootPackage(outputDir, options) {
  const packageDir = join(outputDir, ROOT_PACKAGE_NAME)
  const binDir = join(packageDir, 'bin')
  ensureDir(binDir)

  const manifest = {
    name: ROOT_PACKAGE_NAME,
    version: options.version,
    private: false,
    description: 'macOS binary launcher package for Gclm Code.',
    type: 'module',
    license: rootPkg.license ?? 'UNLICENSED',
    os: ['darwin'],
    cpu: ['x64', 'arm64'],
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
    '# gclm-code\n\nGenerated macOS npm launcher package.\n',
  )
}

function writeArchPackage(outputDir, arch, binaryPath, version) {
  const meta = MAC_ARCH_PACKAGES[arch]
  const packageDir = join(outputDir, meta.packageName)
  const binDir = join(packageDir, 'bin')
  const resourcesDir = join(packageDir, 'resources')
  ensureDir(binDir)
  ensureDir(resourcesDir)

  const targetBinaryPath = join(binDir, 'gc')
  copyFileSync(binaryPath, targetBinaryPath)
  chmodSync(targetBinaryPath, 0o755)

  const manifest = {
    name: meta.packageName,
    version,
    private: false,
    description: meta.description,
    type: 'module',
    license: rootPkg.license ?? 'UNLICENSED',
    os: ['darwin'],
    cpu: meta.cpu,
    files: [
      'bin',
      'resources',
      'README.md',
    ],
  }

  writeJson(join(packageDir, 'package.json'), manifest)
  writeText(
    join(packageDir, 'README.md'),
    `# ${meta.packageName}\n\nGenerated macOS ${arch} binary package for Gclm Code.\n`,
  )
}

const options = parseArgs(process.argv.slice(2))
ensureBinary(options.binaries.x64, 'darwin-x64')
ensureBinary(options.binaries.arm64, 'darwin-arm64')

rmSync(options.outputDir, { recursive: true, force: true })
ensureDir(options.outputDir)

writeRootPackage(options.outputDir, options)
writeArchPackage(options.outputDir, 'x64', options.binaries.x64, options.version)
writeArchPackage(options.outputDir, 'arm64', options.binaries.arm64, options.version)

process.stdout.write(
  [
    `Prepared mac binary npm packages at ${options.outputDir}`,
    `- ${ROOT_PACKAGE_NAME}`,
    ...Object.values(MAC_ARCH_PACKAGES).map(meta => `- ${meta.packageName}`),
  ].join('\n') + '\n',
)
