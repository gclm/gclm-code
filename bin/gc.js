#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageDir = dirname(dirname(fileURLToPath(import.meta.url)))
const manifestPath = join(packageDir, 'vendor', 'manifest.json')

function fail(message) {
  process.stderr.write(`[gclm-code] ${message}\n`)
  process.exit(1)
}

function readManifest() {
  let raw
  try {
    raw = readFileSync(manifestPath, 'utf8')
  } catch (error) {
    fail(`缺少运行时清单: ${manifestPath} (${error.message})`)
  }

  try {
    return JSON.parse(raw)
  } catch (error) {
    fail(`运行时清单解析失败: ${manifestPath} (${error.message})`)
  }
}

const manifest = readManifest()
const platformId = `${process.platform}-${process.arch}`
const platformEntry = manifest?.runtime?.platforms?.[platformId]

if (!platformEntry) {
  fail(`当前暂不支持平台组合: ${platformId}`)
}

if (
  typeof platformEntry.installSubpath !== 'string' ||
  platformEntry.installSubpath.length === 0
) {
  fail(`运行时清单缺少 installSubpath: ${platformId}`)
}

const binaryPath = join(packageDir, platformEntry.installSubpath)
if (!existsSync(binaryPath)) {
  const assetHint =
    typeof platformEntry.assetName === 'string' && platformEntry.assetName.length > 0
      ? `；预期资产: ${platformEntry.assetName}`
      : ''

  fail(
    `当前平台 runtime 未就绪: ${binaryPath}${assetHint}。请重新安装 gclm-code，或运行 npm rebuild gclm-code 重新触发 runtime 安装`,
  )
}

const moduleNodePath =
  typeof manifest?.modules?.nodePath === 'string' && manifest.modules.nodePath.length > 0
    ? join(packageDir, manifest.modules.nodePath)
    : null

const childEnv = { ...process.env }
if (moduleNodePath && existsSync(moduleNodePath)) {
  childEnv.NODE_PATH = childEnv.NODE_PATH
    ? `${moduleNodePath}${delimiter}${childEnv.NODE_PATH}`
    : moduleNodePath
}

const child = spawn(binaryPath, process.argv.slice(2), {
  stdio: 'inherit',
  env: childEnv,
})

child.on('error', error => {
  fail(`启动 runtime 失败: ${error.message}`)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
