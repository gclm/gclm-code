import {
  cpSync,
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { copyInstalledDependencyTree } from './lib/vendor-runtime-modules.mjs'
import {
  currentMacArch,
  getRepoRoot,
  readRootPackage,
} from './lib/single-package-npm.mjs'

const rootDir = getRepoRoot(import.meta.url)
const rootPkg = readRootPackage(rootDir)
const currentArch = currentMacArch()

if (!currentArch) {
  process.stderr.write(
    'SKIP single-package-vendor-modules-smoke - 当前仅在 macOS x64/arm64 环境下执行\n',
  )
  process.exit(0)
}

function parseArgs(argv) {
  const options = {
    stagingDir: resolve(rootDir, 'dist', 'single-package-vendor-smoke'),
    releaseAssetsDir: resolve(rootDir, 'dist', 'single-package-vendor-assets'),
    version: rootPkg.version,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--staging-dir' && argv[i + 1]) {
      options.stagingDir = resolve(rootDir, argv[i + 1])
      i += 1
      continue
    }
    if (arg === '--release-assets-dir' && argv[i + 1]) {
      options.releaseAssetsDir = resolve(rootDir, argv[i + 1])
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
    env: options.env,
  })

  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    throw new Error(output || `${command} failed`)
  }

  return result
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function renderSmokeScript() {
  return `function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const core = await import('audio-capture-napi')
assert(typeof core.isNativeAudioAvailable === 'function', 'audio-capture-napi contract invalid')

const imageProcessor = await import('image-processor-napi')
assert(typeof imageProcessor.getNativeModule === 'function', 'image-processor-napi contract invalid')
const imageNative = imageProcessor.getNativeModule()
assert(imageNative && typeof imageNative.processImage === 'function', 'image-processor-napi native wrapper invalid')

const modifiers = await import('modifiers-napi')
assert(typeof modifiers.prewarm === 'function', 'modifiers-napi contract invalid')
modifiers.prewarm()

const urlHandler = await import('url-handler-napi')
assert(typeof urlHandler.waitForUrlEvent === 'function', 'url-handler-napi contract invalid')
urlHandler.waitForUrlEvent(1)

const chromeMcp = await import('@ant/claude-for-chrome-mcp')
assert(Array.isArray(chromeMcp.BROWSER_TOOLS), '@ant/claude-for-chrome-mcp contract invalid')

const computerUseInput = await import('@ant/computer-use-input')
assert(
  computerUseInput.default && typeof computerUseInput.default.isSupported === 'boolean',
  '@ant/computer-use-input contract invalid',
)

const computerUseMcp = await import('@ant/computer-use-mcp')
assert(typeof computerUseMcp.buildComputerUseTools === 'function', '@ant/computer-use-mcp contract invalid')
const tools = computerUseMcp.buildComputerUseTools(
  {
    screenshotFiltering: 'native',
    platform: process.platform === 'win32' ? 'win32' : 'darwin',
  },
  'pixels',
)
assert(Array.isArray(tools) && tools.length > 0, '@ant/computer-use-mcp tools invalid')

const computerUseSwift = await import('@ant/computer-use-swift')
assert(computerUseSwift.default, '@ant/computer-use-swift default export missing')

console.log('PASS vendor-modules-runtime-smoke')
`
}

const options = parseArgs(process.argv.slice(2))
const tempDir = mkdtempSync(join(tmpdir(), 'gclm-single-package-vendor-'))
const packageDir = join(options.stagingDir, 'gclm-code')
const installDir = join(tempDir, 'gclm-code')
const platformId = `${process.platform}-${process.arch}`

try {
  run('node', [
    './scripts/prepare-mac-release-assets.mjs',
    '--output-dir',
    options.releaseAssetsDir,
    '--version',
    options.version,
  ])

  run('node', [
    './scripts/prepare-single-package-npm.mjs',
    '--output-dir',
    options.stagingDir,
    '--version',
    options.version,
    '--runtime-base-url',
    options.releaseAssetsDir,
  ])

  const vendorManifest = JSON.parse(
    readFileSync(join(packageDir, 'vendor', 'manifest.json'), 'utf8'),
  )
  const packageManifest = JSON.parse(
    readFileSync(join(packageDir, 'package.json'), 'utf8'),
  )

  assert(
    vendorManifest?.modules?.nodePath === 'vendor/modules/node_modules',
    'vendor manifest missing modules.nodePath',
  )
  assert(
    Object.keys(vendorManifest?.modules?.workspacePackages ?? {}).length === 8,
    'vendor manifest missing workspace package entries',
  )
  assert(
    Object.keys(packageManifest.dependencies ?? {}).length > 0,
    'single-package manifest missing runtime dependencies',
  )
  assert(
    existsSync(join(packageDir, 'vendor', 'modules', 'node_modules', '@ant', 'computer-use-input', 'src', 'driver-swift.swift')),
    'vendor modules missing computer-use-input sidecar',
  )
  assert(
    existsSync(join(packageDir, 'vendor', 'modules', 'node_modules', '@ant', 'computer-use-swift', 'src', 'driver-jxa.js')),
    'vendor modules missing computer-use-swift sidecar',
  )

  cpSync(packageDir, installDir, { recursive: true, dereference: true })
  copyInstalledDependencyTree({
    rootDir,
    targetNodeModulesDir: join(installDir, 'node_modules'),
    dependencyNames: Object.keys(packageManifest.dependencies ?? {}),
  })

  run('node', ['bin/install-runtime.js', '--package-dir', installDir], {
    cwd: installDir,
  })

  const runtimeNodeModulesPath = join(
    installDir,
    'vendor',
    'runtime',
    platformId,
    'node_modules',
  )
  assert(existsSync(runtimeNodeModulesPath), 'runtime node_modules link missing')
  assert(
    lstatSync(runtimeNodeModulesPath).isSymbolicLink(),
    'runtime node_modules is not a symlink',
  )

  const smokeScriptPath = join(
    installDir,
    'vendor',
    'runtime',
    platformId,
    'vendor-modules-smoke.mjs',
  )
  writeFileSync(smokeScriptPath, renderSmokeScript())

  run('bun', [smokeScriptPath], {
    cwd: join(installDir, 'vendor', 'runtime', platformId),
  })

  const versionResult = run('node', ['bin/gc.js', '--version'], {
    cwd: installDir,
  })
  const versionOutput = `${versionResult.stdout ?? ''}`.trim()
  assert(versionOutput.includes(options.version), `unexpected gc version output: ${versionOutput}`)

  process.stdout.write(
    `PASS single-package-vendor-modules-smoke - arch=${currentArch} version=${versionOutput}\n`,
  )
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
