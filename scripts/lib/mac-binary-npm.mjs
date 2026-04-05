import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getBinaryNpmReleasePlatforms,
  getBinaryPackageDirectoryNames,
  getBinaryPackagePublishOrder,
  getLauncherPackageMap,
  ROOT_PACKAGE_NAME,
} from './release-platforms.mjs'

export { ROOT_PACKAGE_NAME }

export const MAC_ARCH_PACKAGES = Object.freeze(
  Object.fromEntries(
    getBinaryNpmReleasePlatforms().map(platform => [
      platform.arch,
      {
        platformId: platform.platformId,
        packageName: platform.packageName,
        cpu: [platform.arch],
        description: platform.description,
        releaseLabel: platform.releaseLabel,
        binaryArtifact: platform.binaryArtifact,
      },
    ]),
  ),
)

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
  return getBinaryPackageDirectoryNames()
}

export function getMacPackagePublishOrder() {
  return getBinaryPackagePublishOrder()
}

export function npmPackFileName(packageName, version) {
  return `${packageName.replace(/^@/, '').replaceAll('/', '-')}-${version}.tgz`
}

export function renderRootLauncher() {
  const packageMap = getLauncherPackageMap()

  return `#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'

const require = createRequire(import.meta.url)
const packageMap = ${JSON.stringify(packageMap, null, 2)}

function fail(message) {
  process.stderr.write(\`[gclm-code] \${message}\\n\`)
  process.exit(1)
}

const osPackageMap = packageMap[process.platform]
if (!osPackageMap) {
  fail(\`当前暂不支持平台: \${process.platform}\`)
}

const packageName = osPackageMap[process.arch]
if (!packageName) {
  fail(\`当前暂不支持平台组合: \${process.platform}/\${process.arch}\`)
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
