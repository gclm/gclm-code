import { once } from 'node:events'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  currentMacArch,
  getMacPackagePublishOrder,
  getRepoRoot,
  MAC_ARCH_PACKAGES,
  npmPackFileName,
  readRootPackage,
  ROOT_PACKAGE_NAME,
} from './lib/mac-binary-npm.mjs'

const rootDir = getRepoRoot(import.meta.url)
const currentArch = currentMacArch()

if (!currentArch) {
  process.stderr.write('SKIP mac-binary-npm-registry-smoke - 当前仅在 macOS x64/arm64 环境下执行\n')
  process.exit(0)
}

function parseArgs(argv) {
  const rootPkg = readRootPackage(rootDir)
  const options = {
    stagingDir: resolve(rootDir, 'dist', 'npm-registry-smoke'),
    tarballsDir: resolve(rootDir, 'dist', 'npm-registry-smoke-tarballs'),
    version: rootPkg.version,
    binaries: {
      x64: resolve(rootDir, 'gc'),
      arm64: resolve(rootDir, 'gc'),
    },
    registryHost: '127.0.0.1',
    registryPort: null,
    verdaccioPackageSpec: 'verdaccio@6',
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

function createVerdaccioConfig(path) {
  writeFileSync(
    path,
    [
      'storage: ./storage',
      'max_body_size: 300mb',
      'auth:',
      '  htpasswd:',
      '    file: ./htpasswd',
      '    max_users: 1000',
      'uplinks: {}',
      'packages:',
      "  '@*/*':",
      '    access: $all',
      '    publish: $authenticated',
      '    unpublish: $authenticated',
      "  '**':",
      '    access: $all',
      '    publish: $authenticated',
      '    unpublish: $authenticated',
      'log:',
      '  type: stdout',
      '  format: pretty',
      '  level: warn',
      '',
    ].join('\n'),
  )
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

const options = parseArgs(process.argv.slice(2))
const tempDir = mkdtempSync(join(tmpdir(), 'gclm-mac-binary-npm-registry-'))
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
}

let verdaccioProcess = null

try {
  if (!options.skipPack) {
    run('node', [
      './scripts/prepare-mac-binary-npm.mjs',
      '--output-dir',
      options.stagingDir,
      '--version',
      options.version,
      '--darwin-x64-binary',
      options.binaries.x64,
      '--darwin-arm64-binary',
      options.binaries.arm64,
    ])

    run('node', [
      './scripts/pack-mac-binary-npm.mjs',
      '--staging-dir',
      options.stagingDir,
      '--output-dir',
      options.tarballsDir,
    ])
  }

  mkdirSync(npmCacheDir, { recursive: true })
  mkdirSync(verdaccioDir, { recursive: true })
  mkdirSync(tempProjectDir, { recursive: true })
  createVerdaccioConfig(verdaccioConfigPath)

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

  for (const packageName of getMacPackagePublishOrder()) {
    const tarballPath = join(
      options.tarballsDir,
      npmPackFileName(packageName, options.version),
    )
    if (!existsSync(tarballPath)) {
      throw new Error(`Missing tarball for ${packageName}: ${tarballPath}`)
    }

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
  }

  run('npm', ['init', '-y'], {
    cwd: tempProjectDir,
    env: npmEnv,
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

  const installedChildPackage = join(
    tempProjectDir,
    'node_modules',
    MAC_ARCH_PACKAGES[currentArch].packageName,
    'bin',
    'gc',
  )
  if (!existsSync(installedChildPackage)) {
    throw new Error(`registry install missing child binary: ${installedChildPackage}`)
  }

  const versionResult = run(
    join(tempProjectDir, 'node_modules', '.bin', 'gc'),
    ['--version'],
    {
      cwd: tempProjectDir,
      env: npmEnv,
    },
  )

  const output = (versionResult.stdout ?? '').trim()
  if (!output.includes(options.version)) {
    throw new Error(`unexpected gc version output: ${output}`)
  }

  process.stdout.write(
    `PASS mac-binary-npm-registry-smoke - arch=${currentArch} registry=${registryUrl} version=${output}\n`,
  )
} finally {
  await stopVerdaccio(verdaccioProcess)
  rmSync(tempDir, { recursive: true, force: true })
}
