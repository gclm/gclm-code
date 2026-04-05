import { lstatSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  ROOT_PACKAGE_NAME,
  singlePackageTarballName,
} from './lib/single-package-npm.mjs'
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
    'SKIP single-package-npm-install-smoke - 当前仅在 macOS x64/arm64 环境下执行\n',
  )
  process.exit(0)
}

function parseArgs(argv) {
  const options = {
    stagingDir: resolve(rootDir, 'dist', 'single-package-install-smoke'),
    tarballsDir: resolve(rootDir, 'dist', 'single-package-install-tarballs'),
    releaseAssetsDir: resolve(rootDir, 'dist', 'single-package-install-assets'),
    version: rootPkg.version,
    registry: 'https://registry.npmjs.org/',
    skipPack: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--staging-dir' && argv[i + 1]) {
      options.stagingDir = resolve(rootDir, argv[i + 1])
      i += 1
      continue
    }
    if (arg === '--tarballs-dir' && argv[i + 1]) {
      options.tarballsDir = resolve(rootDir, argv[i + 1])
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
    if (arg === '--registry' && argv[i + 1]) {
      options.registry = argv[i + 1]
      i += 1
      continue
    }
    if (arg === '--skip-pack') {
      options.skipPack = true
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
    env: options.env ?? process.env,
  })

  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    throw new Error(output || `${command} failed`)
  }

  return result
}

function writeNpmUserConfig(path, registry) {
  writeFileSync(
    path,
    [
      `registry=${registry}`,
      'ignore-scripts=false',
      'audit=false',
      'fund=false',
      'progress=false',
      '',
    ].join('\n'),
  )
}

function createNpmEnv({ cacheDir, registry, userConfigPath, extraEnv = {} }) {
  return {
    ...process.env,
    npm_config_cache: cacheDir,
    NPM_CONFIG_CACHE: cacheDir,
    npm_config_registry: registry,
    NPM_CONFIG_REGISTRY: registry,
    npm_config_userconfig: userConfigPath,
    NPM_CONFIG_USERCONFIG: userConfigPath,
    npm_config_ignore_scripts: 'false',
    NPM_CONFIG_IGNORE_SCRIPTS: 'false',
    npm_config_audit: 'false',
    NPM_CONFIG_AUDIT: 'false',
    npm_config_fund: 'false',
    NPM_CONFIG_FUND: 'false',
    ...extraEnv,
  }
}

const options = parseArgs(process.argv.slice(2))
const tempDir = mkdtempSync(join(tmpdir(), 'gclm-single-package-npm-install-'))
const npmCacheDir = join(tempDir, '.npm-cache')
const userConfigPath = join(tempDir, '.npmrc')

try {
  if (!options.skipPack) {
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
    ])

    run('node', [
      './scripts/pack-single-package-npm.mjs',
      '--staging-dir',
      options.stagingDir,
      '--output-dir',
      options.tarballsDir,
    ])
  }

  const tarballPath = join(
    options.tarballsDir,
    singlePackageTarballName(options.version, ROOT_PACKAGE_NAME),
  )
  const tempProjectDir = join(tempDir, 'project')
  mkdirSync(npmCacheDir, { recursive: true })
  mkdirSync(tempProjectDir, { recursive: true })
  writeNpmUserConfig(userConfigPath, options.registry)

  const npmEnv = createNpmEnv({
    cacheDir: npmCacheDir,
    registry: options.registry,
    userConfigPath,
    extraEnv: {
      GCLM_BINARY_BASE_URL: options.releaseAssetsDir,
    },
  })

  run('npm', ['init', '-y', '--userconfig', userConfigPath], {
    cwd: tempProjectDir,
    env: npmEnv,
  })

  run(
    'npm',
    [
      'install',
      '--registry',
      options.registry,
      '--userconfig',
      userConfigPath,
      '--no-package-lock',
      `--cache=${npmCacheDir}`,
      tarballPath,
    ],
    {
      cwd: tempProjectDir,
      env: npmEnv,
    },
  )

  const installedPackageDir = join(
    tempProjectDir,
    'node_modules',
    ROOT_PACKAGE_NAME,
  )
  const installedPackageManifest = JSON.parse(
    readFileSync(join(installedPackageDir, 'package.json'), 'utf8'),
  )
  if (installedPackageManifest.name !== ROOT_PACKAGE_NAME) {
    throw new Error(`unexpected installed package name: ${installedPackageManifest.name}`)
  }

  const versionResult = run(join(tempProjectDir, 'node_modules', '.bin', 'gc'), ['--version'], {
    cwd: tempProjectDir,
    env: npmEnv,
  })

  const runtimeNodeModulesPath = join(
    installedPackageDir,
    'vendor',
    'runtime',
    `${process.platform}-${process.arch}`,
    'node_modules',
  )
  if (!lstatSync(runtimeNodeModulesPath).isSymbolicLink()) {
    throw new Error('runtime node_modules link was not created')
  }

  const output = `${versionResult.stdout ?? ''}`.trim()
  if (!output.includes(options.version)) {
    throw new Error(`unexpected gc version output: ${output}`)
  }

  process.stdout.write(
    `PASS single-package-npm-install-smoke - arch=${currentArch} version=${output}\n`,
  )
} finally {
  rmSync(tempDir, { recursive: true, force: true })
}
