import { once } from 'node:events'
import { spawn, spawnSync } from 'node:child_process'
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { currentMacArch, getRepoRoot, readRootPackage } from './lib/mac-binary-npm.mjs'
import {
  ROOT_PACKAGE_NAME,
  singlePackageTarballName,
} from './lib/single-package-npm.mjs'
import { copyInstalledDependencyTree } from './lib/vendor-runtime-modules.mjs'

const rootDir = getRepoRoot(import.meta.url)
const rootPkg = readRootPackage(rootDir)
const currentArch = currentMacArch()

if (!currentArch) {
  process.stderr.write(
    'SKIP single-package-npm-registry-smoke - 当前仅在 macOS x64/arm64 环境下执行\n',
  )
  process.exit(0)
}

function parseArgs(argv) {
  const options = {
    stagingDir: resolve(rootDir, 'dist', 'single-package-registry-smoke'),
    tarballsDir: resolve(rootDir, 'dist', 'single-package-registry-tarballs'),
    releaseAssetsDir: resolve(rootDir, 'dist', 'single-package-registry-assets'),
    version: rootPkg.version,
    registryHost: '127.0.0.1',
    registryPort: null,
    verdaccioPackageSpec: 'verdaccio@6',
    upstreamRegistry: null,
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
    if (arg === '--registry-host' && argv[i + 1]) {
      options.registryHost = argv[i + 1]
      i += 1
      continue
    }
    if (arg === '--registry-port' && argv[i + 1]) {
      options.registryPort = Number(argv[i + 1])
      i += 1
      continue
    }
    if (arg === '--verdaccio-package' && argv[i + 1]) {
      options.verdaccioPackageSpec = argv[i + 1]
      i += 1
      continue
    }
    if (arg === '--upstream-registry' && argv[i + 1]) {
      options.upstreamRegistry = argv[i + 1]
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
    input: options.input,
    env: options.env ?? process.env,
  })

  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    throw new Error(output || `${command} failed`)
  }

  return result
}

function appendLogs(logs, chunk) {
  const lines = String(chunk)
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)

  for (const line of lines) {
    logs.push(line)
    if (logs.length > 120) {
      logs.shift()
    }
  }
}

function createVerdaccioConfig(path, upstreamRegistry) {
  const lines = [
    'storage: ./storage',
    'max_body_size: 300mb',
    'auth:',
    '  htpasswd:',
    '    file: ./htpasswd',
    '    max_users: 1000',
  ]

  if (upstreamRegistry) {
    lines.push(
      'uplinks:',
      '  npmjs:',
      `    url: ${upstreamRegistry}`,
    )
  } else {
    lines.push('uplinks: {}')
  }

  lines.push(
    'packages:',
    `  '${ROOT_PACKAGE_NAME}':`,
    '    access: $all',
    '    publish: $authenticated',
    '    unpublish: $authenticated',
    "  '@*/*':",
    '    access: $all',
    '    publish: $authenticated',
    '    unpublish: $authenticated',
    upstreamRegistry ? '    proxy: npmjs' : '',
    "  '**':",
    '    access: $all',
    '    publish: $authenticated',
    '    unpublish: $authenticated',
    upstreamRegistry ? '    proxy: npmjs' : '',
    'log:',
    '  type: stdout',
    '  format: pretty',
    '  level: warn',
    '',
  )

  writeFileSync(path, lines.filter(Boolean).join('\n'))
}

async function resolvePort(host) {
  return await new Promise((resolvePromise, rejectPromise) => {
    const server = createServer()
    server.on('error', rejectPromise)
    server.listen(0, host, () => {
      const address = server.address()
      if (!address || typeof address === 'string') {
        server.close()
        rejectPromise(new Error('Failed to resolve verdaccio port'))
        return
      }
      server.close(error => {
        if (error) {
          rejectPromise(error)
          return
        }
        resolvePromise(address.port)
      })
    })
  })
}

function startVerdaccio(options) {
  const logs = []
  const child = spawn(
    'npx',
    [
      '--yes',
      options.verdaccioPackageSpec,
      '--config',
      options.configPath,
      '--listen',
      `${options.registryHost}:${options.registryPort}`,
    ],
    {
      cwd: rootDir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        npm_config_cache: options.npmCacheDir,
        NPM_CONFIG_CACHE: options.npmCacheDir,
      },
    },
  )

  child.stdout.on('data', chunk => appendLogs(logs, chunk))
  child.stderr.on('data', chunk => appendLogs(logs, chunk))

  return { child, logs }
}

async function waitForVerdaccio(registryUrl, child, logs) {
  const pingUrl = `${registryUrl}/-/ping`
  const deadline = Date.now() + 90_000

  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(
        [
          `Verdaccio exited before becoming ready (code=${child.exitCode}).`,
          'Recent logs:',
          ...logs,
        ].join('\n'),
      )
    }

    try {
      const response = await fetch(pingUrl)
      if (response.ok) {
        return
      }
    } catch {
      // Wait until Verdaccio binds the port.
    }

    await delay(500)
  }

  throw new Error(
    [
      `Timed out waiting for Verdaccio at ${registryUrl}.`,
      'Recent logs:',
      ...logs,
    ].join('\n'),
  )
}

async function stopVerdaccio(child) {
  if (!child || child.exitCode !== null) {
    return
  }

  child.kill('SIGTERM')

  const didTimeout = await Promise.race([
    once(child, 'exit').then(() => false),
    delay(5_000).then(() => true),
  ])

  if (didTimeout) {
    child.kill('SIGKILL')
    await once(child, 'exit')
  }
}

async function loginToVerdaccio(registryUrl, userConfigPath) {
  const username = 'gclm-smoke'
  const response = await fetch(
    `${registryUrl}/-/user/org.couchdb.user:${encodeURIComponent(username)}`,
    {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        _id: `org.couchdb.user:${username}`,
        name: username,
        password: 'gclm-smoke-pass',
        email: 'gclm-smoke@example.com',
        type: 'user',
        roles: [],
        date: new Date().toISOString(),
      }),
    },
  )

  if (!response.ok) {
    throw new Error(`Verdaccio login failed (${response.status} ${response.statusText})`)
  }

  const payload = await response.json()
  if (!payload?.token) {
    throw new Error(`Verdaccio login did not return a token: ${JSON.stringify(payload)}`)
  }

  const registryHost = new URL(registryUrl).host
  writeFileSync(
    userConfigPath,
    [
      `registry=${registryUrl}/`,
      `//${registryHost}/:_authToken=${payload.token}`,
      '',
    ].join('\n'),
  )
}

function readPackageManifestFromTarball(tarballPath, tempDir) {
  const extractDir = join(tempDir, 'tarball')
  mkdirSync(extractDir, { recursive: true })
  run('tar', ['-xzf', tarballPath, '-C', extractDir])
  return JSON.parse(readFileSync(join(extractDir, 'package', 'package.json'), 'utf8'))
}

const options = parseArgs(process.argv.slice(2))
const tempDir = mkdtempSync(join(tmpdir(), 'gclm-single-package-registry-'))
const npmCacheDir = join(tempDir, '.npm-cache')
const userConfigPath = join(tempDir, '.npmrc')
const verdaccioDir = join(tempDir, 'verdaccio')
const verdaccioConfigPath = join(verdaccioDir, 'config.yaml')
const tempProjectDir = join(tempDir, 'project')
const registryPort = options.registryPort ?? (await resolvePort(options.registryHost))
const registryUrl = `http://${options.registryHost}:${registryPort}`
const npmEnv = {
  ...process.env,
  npm_config_cache: npmCacheDir,
  NPM_CONFIG_CACHE: npmCacheDir,
  GCLM_BINARY_BASE_URL: options.releaseAssetsDir,
}

let verdaccioProcess = null

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
  if (!existsSync(tarballPath)) {
    throw new Error(`Missing tarball: ${tarballPath}`)
  }

  const packageManifest = readPackageManifestFromTarball(tarballPath, tempDir)

  mkdirSync(npmCacheDir, { recursive: true })
  mkdirSync(verdaccioDir, { recursive: true })
  mkdirSync(tempProjectDir, { recursive: true })
  createVerdaccioConfig(verdaccioConfigPath, options.upstreamRegistry)

  const verdaccioState = startVerdaccio({
    configPath: verdaccioConfigPath,
    registryHost: options.registryHost,
    registryPort,
    verdaccioPackageSpec: options.verdaccioPackageSpec,
    npmCacheDir,
  })
  verdaccioProcess = verdaccioState.child

  await waitForVerdaccio(registryUrl, verdaccioProcess, verdaccioState.logs)
  await loginToVerdaccio(registryUrl, userConfigPath)

  run(
    'npm',
    [
      'publish',
      '--registry',
      registryUrl,
      '--userconfig',
      userConfigPath,
      '--access',
      'public',
      tarballPath,
    ],
    {
      cwd: tempDir,
      env: npmEnv,
    },
  )

  run('npm', ['init', '-y'], {
    cwd: tempProjectDir,
    env: npmEnv,
  })

  copyInstalledDependencyTree({
    rootDir,
    targetNodeModulesDir: join(tempProjectDir, 'node_modules'),
    dependencyNames: Object.keys(packageManifest.dependencies ?? {}),
  })

  run(
    'npm',
    [
      'install',
      '--registry',
      registryUrl,
      '--userconfig',
      userConfigPath,
      '--no-package-lock',
      `${ROOT_PACKAGE_NAME}@${options.version}`,
    ],
    {
      cwd: tempProjectDir,
      env: npmEnv,
    },
  )

  const runtimeNodeModulesPath = join(
    tempProjectDir,
    'node_modules',
    ROOT_PACKAGE_NAME,
    'vendor',
    'runtime',
    `${process.platform}-${process.arch}`,
    'node_modules',
  )
  if (!existsSync(runtimeNodeModulesPath)) {
    throw new Error(`runtime node_modules link missing: ${runtimeNodeModulesPath}`)
  }
  if (!lstatSync(runtimeNodeModulesPath).isSymbolicLink()) {
    throw new Error('runtime node_modules is not a symlink')
  }

  const versionResult = run(
    join(tempProjectDir, 'node_modules', '.bin', 'gc'),
    ['--version'],
    {
      cwd: tempProjectDir,
      env: npmEnv,
    },
  )

  const output = `${versionResult.stdout ?? ''}`.trim()
  if (!output.includes(options.version)) {
    throw new Error(`unexpected gc version output: ${output}`)
  }

  process.stdout.write(
    `PASS single-package-npm-registry-smoke - arch=${currentArch} registry=${registryUrl} version=${output}\n`,
  )
} finally {
  await stopVerdaccio(verdaccioProcess)
  rmSync(tempDir, { recursive: true, force: true })
}
