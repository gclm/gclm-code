import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT_PACKAGE_NAME = 'gclm-code'

export const MAC_ARCH_PACKAGES = {
  x64: {
    packageName: 'gclm-code-darwin-x64',
    cpu: ['x64'],
    description: 'macOS x64 binary package for Gclm Code.',
    releaseLabel: 'darwin-x64',
  },
  arm64: {
    packageName: 'gclm-code-darwin-arm64',
    cpu: ['arm64'],
    description: 'macOS arm64 binary package for Gclm Code.',
    releaseLabel: 'darwin-arm64',
  },
}

export function getRepoRoot(importMetaUrl) {
  return resolve(dirname(fileURLToPath(importMetaUrl)), '..')
}

export function readRootPackage(rootDir) {
  return JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'))
}

export function currentMacArch() {
  if (process.platform !== 'darwin') {
    return null
  }

  if (process.arch === 'x64' || process.arch === 'arm64') {
    return process.arch
  }

  return null
}

export function getMacPackageDirectoryNames() {
  return [
    ROOT_PACKAGE_NAME,
    ...Object.values(MAC_ARCH_PACKAGES).map(meta => meta.packageName),
  ]
}

export function getMacPackagePublishOrder() {
  return [
    MAC_ARCH_PACKAGES.x64.packageName,
    MAC_ARCH_PACKAGES.arm64.packageName,
    ROOT_PACKAGE_NAME,
  ]
}

export function npmPackFileName(packageName, version) {
  return `${packageName.replace(/^@/, '').replaceAll('/', '-')}-${version}.tgz`
}

export function renderRootLauncher() {
  return `#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const packageMap = {
  x64: 'gclm-code-darwin-x64',
  arm64: 'gclm-code-darwin-arm64',
}

function fail(message) {
  process.stderr.write(\`[gclm-code] \${message}\\n\`)
  process.exit(1)
}

if (process.platform !== 'darwin') {
  fail(\`当前仅支持 macOS，收到平台: \${process.platform}\`)
}

const packageName = packageMap[process.arch]
if (!packageName) {
  fail(\`当前暂不支持架构: \${process.arch}\`)
}

let packageJsonPath
try {
  packageJsonPath = require.resolve(\`\${packageName}/package.json\`)
} catch {
  fail(\`未找到匹配架构包 \${packageName}，请重新安装 gclm-code\`)
}

const binaryPath = join(dirname(packageJsonPath), 'bin', 'gc')
if (!existsSync(binaryPath)) {
  fail(\`\${packageName} 缺少可执行文件: \${binaryPath}\`)
}

const child = spawn(binaryPath, process.argv.slice(2), {
  stdio: 'inherit',
})

child.on('error', error => {
  fail(\`启动 \${packageName} 失败: \${error.message}\`)
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }
  process.exit(code ?? 1)
})
`
}
