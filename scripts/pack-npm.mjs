import { cpSync, copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const rootDir = resolve(__dirname, '..')

function parseArgs(argv) {
  const options = {
    stagingDir: resolve(rootDir, 'dist', 'npm-package'),
    outputDir: resolve(rootDir, 'dist', 'npm-tarballs'),
    version: null,
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
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        'Usage: pack-npm.mjs [options]\n\n' +
        'Options:\n' +
        '  --staging-dir <path>   Output staging directory (default: dist/npm-package)\n' +
        '  --output-dir <path>    Tarball output directory (default: dist/npm-tarballs)\n' +
        '  --version <version>    Override version (default: from package.json)\n',
      )
      process.exit(0)
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function readRootPackage() {
  return JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'))
}

function createMinimalPackageJson(rootPkg, version) {
  return {
    name: rootPkg.name,
    version,
    description: rootPkg.description,
    type: 'module',
    bin: {
      gclm: 'cli.js',
      gc: 'cli.js',
      claude: 'cli.js',
    },
    homepage: rootPkg.homepage,
    bugs: rootPkg.bugs,
    license: rootPkg.license ?? 'UNLICENSED',
    engines: rootPkg.engines,
    dependencies: {},
    optionalDependencies: rootPkg.optionalDependencies,
    files: [
      'cli.js',
      'vendor/ripgrep/',
      'README.md',
    ],
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

  return result
}

const options = parseArgs(process.argv.slice(2))
const rootPkg = readRootPackage()
const version = options.version || rootPkg.version

const sourceBundle = resolve(rootDir, 'dist', 'cli.js')
if (!existsSync(sourceBundle)) {
  throw new Error(
    `Missing source bundle: ${sourceBundle}\nRun \`bun run build\` first.`,
  )
}

const stagingPackageDir = options.stagingDir

rmSync(stagingPackageDir, { recursive: true, force: true })
mkdirSync(stagingPackageDir, { recursive: true })

// cli.js — prepend shebang if missing
let cliContent = readFileSync(sourceBundle, 'utf8')
if (!cliContent.startsWith('#!/usr/bin/env node')) {
  cliContent = '#!/usr/bin/env node\n' + cliContent
}
writeFileSync(join(stagingPackageDir, 'cli.js'), cliContent)

// package.json
const manifest = createMinimalPackageJson(rootPkg, version)
writeFileSync(
  join(stagingPackageDir, 'package.json'),
  JSON.stringify(manifest, null, 2) + '\n',
)

// README.md
const readmePath = resolve(rootDir, 'README.md')
if (existsSync(readmePath)) {
  copyFileSync(readmePath, join(stagingPackageDir, 'README.md'))
}

// vendor/ripgrep — needed for GrepTool, file suggestions, glob, etc.
const vendorRipgrepSource = resolve(rootDir, 'vendor', 'ripgrep')
if (existsSync(vendorRipgrepSource)) {
  const vendorRipgrepDest = join(stagingPackageDir, 'vendor', 'ripgrep')
  cpSync(vendorRipgrepSource, vendorRipgrepDest, { recursive: true })
} else {
  process.stderr.write('WARNING: vendor/ripgrep not found — ripgrep will rely on system `rg`\n')
}

process.stdout.write(`\nStaged npm package at: ${stagingPackageDir}\n`)
process.stdout.write(`  cli.js         <- ${sourceBundle}\n`)
process.stdout.write(`  package.json   ${manifest.name}@${version}\n`)
process.stdout.write(`  vendor/ripgrep/  (bundled rg binaries)\n`)

// npm pack
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
  { cwd: stagingPackageDir },
)

const tarballName = `${packResult.stdout ?? ''}`
  .trim()
  .split(/\r?\n/)
  .map(line => line.trim())
  .filter(Boolean)
  .at(-1)

if (!tarballName) {
  throw new Error('npm pack did not report tarball name')
}

const tarballPath = join(options.outputDir, tarballName)
if (!existsSync(tarballPath)) {
  throw new Error(`Expected tarball not found: ${tarballPath}`)
}

// Verify tarball does NOT contain source/test/reference files
const tarList = run('tar', ['-tf', tarballPath])
const tarEntries = `${tarList.stdout ?? ''}`.split(/\r?\n/).filter(Boolean)

const forbidden = [
  'package/src/',
  'package/tests/',
  'package/references/',
  'package/scripts/',
  'package/docs/',
  'package/packages/',
  'package/dist/',
  'package/bin/',
]

const violations = tarEntries.filter(entry =>
  forbidden.some(prefix => entry.startsWith(prefix)),
)

if (violations.length > 0) {
  process.stderr.write('ERROR: tarball contains forbidden paths:\n')
  for (const v of violations) {
    process.stderr.write(`  ${v}\n`)
  }
  throw new Error('Tarball contains forbidden paths')
}

process.stdout.write(`\nPacked: ${tarballPath}\n`)
process.stdout.write(`Tarball entries (${tarEntries.length}):\n`)
for (const entry of tarEntries.sort()) {
  process.stdout.write(`  ${entry}\n`)
}
process.stdout.write('\nDone.\n')
