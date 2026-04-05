#!/usr/bin/env node
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function fail(message) {
  process.stderr.write(`[gclm-code] ${message}\n`)
  process.exit(1)
}

function parseArgs(argv) {
  const scriptPackageDir = dirname(dirname(fileURLToPath(import.meta.url)))
  const options = {
    packageDir: scriptPackageDir,
    force: false,
  }

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]
    if (arg === '--package-dir' && argv[i + 1]) {
      options.packageDir = resolve(argv[i + 1])
      i += 1
      continue
    }
    if (arg === '--force') {
      options.force = true
      continue
    }
    throw new Error(`Unknown argument: ${arg}`)
  }

  return options
}

function readManifest(packageDir) {
  const manifestPath = join(packageDir, 'vendor', 'manifest.json')
  let raw
  try {
    raw = readFileSync(manifestPath, 'utf8')
  } catch (error) {
    fail(`读取运行时清单失败: ${manifestPath} (${error.message})`)
  }

  try {
    return {
      manifestPath,
      value: JSON.parse(raw),
    }
  } catch (error) {
    fail(`运行时清单解析失败: ${manifestPath} (${error.message})`)
  }
}

function resolveBaseUrl(manifest, packageDir) {
  const envName = manifest?.runtime?.baseUrlEnv
  const envBaseUrl =
    typeof envName === 'string' && envName.length > 0
      ? process.env[envName]
      : undefined

  const baseUrl =
    typeof envBaseUrl === 'string' && envBaseUrl.length > 0
      ? envBaseUrl
      : manifest?.runtime?.baseUrl

  if (typeof baseUrl !== 'string' || baseUrl.length === 0) {
    fail(
      `缺少 runtime 来源地址，请设置 ${envName ?? 'GCLM_BINARY_BASE_URL'} 或在 vendor/manifest.json 中提供 runtime.baseUrl`,
    )
  }

  if (baseUrl.startsWith('file://')) {
    return {
      type: 'file',
      value: fileURLToPath(baseUrl),
    }
  }

  if (baseUrl.startsWith('http://') || baseUrl.startsWith('https://')) {
    return {
      type: 'http',
      value: baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`,
    }
  }

  return {
    type: 'file',
    value: resolve(packageDir, baseUrl),
  }
}

async function fetchHttp(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

async function readAsset(assetSource, fileName) {
  if (assetSource.type === 'http') {
    const targetUrl = new URL(fileName, assetSource.value).toString()
    return {
      location: targetUrl,
      content: await fetchHttp(targetUrl),
    }
  }

  const targetPath = join(assetSource.value, fileName)
  return {
    location: targetPath,
    content: readFileSync(targetPath),
  }
}

function parseChecksumFile(content) {
  const text = content.toString('utf8').trim()
  const [hash] = text.split(/\s+/)
  if (!hash) {
    throw new Error('checksum 文件为空')
  }
  return hash
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex')
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    stdio: 'pipe',
  })

  if (result.status !== 0) {
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim()
    throw new Error(output || `${command} failed`)
  }
}

const options = parseArgs(process.argv.slice(2))
const { value: manifest } = readManifest(options.packageDir)
const platformId = `${process.platform}-${process.arch}`
const platformEntry = manifest?.runtime?.platforms?.[platformId]

if (!platformEntry) {
  process.stdout.write(
    `[gclm-code] SKIP runtime install - 当前暂不支持平台组合: ${platformId}\n`,
  )
  process.exit(0)
}

if (
  typeof platformEntry.installSubpath !== 'string' ||
  platformEntry.installSubpath.length === 0
) {
  fail(`运行时清单缺少 installSubpath: ${platformId}`)
}

if (
  typeof platformEntry.archiveBinarySubpath !== 'string' ||
  platformEntry.archiveBinarySubpath.length === 0
) {
  fail(`运行时清单缺少 archiveBinarySubpath: ${platformId}`)
}

const assetSource = resolveBaseUrl(manifest, options.packageDir)
const installPath = join(options.packageDir, platformEntry.installSubpath)
const installDir = dirname(installPath)
const tempDir = mkdtempSync(join(tmpdir(), 'gclm-runtime-install-'))
const moduleNodePath =
  typeof manifest?.modules?.nodePath === 'string' && manifest.modules.nodePath.length > 0
    ? join(options.packageDir, manifest.modules.nodePath)
    : null

try {
  const assetName = platformEntry.assetName
  const checksumAssetName = platformEntry.checksumAssetName
  if (typeof assetName !== 'string' || assetName.length === 0) {
    fail(`运行时清单缺少 assetName: ${platformId}`)
  }
  if (
    typeof checksumAssetName !== 'string' ||
    checksumAssetName.length === 0
  ) {
    fail(`运行时清单缺少 checksumAssetName: ${platformId}`)
  }

  const [{ location: assetLocation, content: archiveContent }, { content: checksumContent }] =
    await Promise.all([
      readAsset(assetSource, assetName),
      readAsset(assetSource, checksumAssetName),
    ])

  const expectedSha = parseChecksumFile(checksumContent)
  const actualSha = sha256(archiveContent)
  if (expectedSha !== actualSha) {
    fail(
      `runtime sha256 校验失败: ${assetName} expected=${expectedSha} actual=${actualSha}`,
    )
  }

  const archivePath = join(tempDir, assetName)
  const extractDir = join(tempDir, 'extract')
  mkdirSync(extractDir, { recursive: true })
  writeFileSync(archivePath, archiveContent)

  run('tar', [
    '-xzf',
    archivePath,
    '-C',
    extractDir,
    platformEntry.archiveBinarySubpath,
  ])

  const extractedBinaryPath = join(extractDir, platformEntry.archiveBinarySubpath)
  mkdirSync(installDir, { recursive: true })
  copyFileSync(extractedBinaryPath, installPath)
  chmodSync(installPath, 0o755)

  if (moduleNodePath && existsSync(moduleNodePath)) {
    const runtimeNodeModulesPath = join(installDir, 'node_modules')
    rmSync(runtimeNodeModulesPath, { recursive: true, force: true })
    symlinkSync(relative(installDir, moduleNodePath), runtimeNodeModulesPath, 'dir')
  }

  process.stdout.write(
    `[gclm-code] runtime 已安装: ${platformId} <- ${assetLocation}\n`,
  )
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error)
  fail(`安装当前平台 runtime 失败: ${detail}`)
} finally {
  if (options.force) {
    // Placeholder to keep CLI stable if future force-specific cleanup is needed.
  }
  rmSync(tempDir, { recursive: true, force: true })
}
