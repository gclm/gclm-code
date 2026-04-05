import { copyFileSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  getBinaryNpmReleasePlatforms,
  ROOT_PACKAGE_NAME,
} from './release-platforms.mjs'

export { ROOT_PACKAGE_NAME }

export const SINGLE_PACKAGE_MANIFEST_VERSION = 1
export const DEFAULT_RUNTIME_BASE_URL_ENV = 'GCLM_BINARY_BASE_URL'

export function getRepoRoot(importMetaUrl) {
  return resolve(dirname(fileURLToPath(importMetaUrl)), '..')
}

export function readRootPackage(rootDir) {
  return JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8'))
}

export function singlePackageAssetName(version, platform) {
  return `${ROOT_PACKAGE_NAME}-${version}-${platform.releaseLabel}.tar.gz`
}

export function createVendorManifest({
  version,
  runtimeBaseUrl = null,
  releaseTag = `v${version}`,
  generatedAt = new Date().toISOString(),
  modules = {},
}) {
  const platforms = Object.fromEntries(
    getBinaryNpmReleasePlatforms().map(platform => {
      const assetName = singlePackageAssetName(version, platform)
      return [
        platform.platformId,
        {
          os: platform.os,
          arch: platform.arch,
          releaseLabel: platform.releaseLabel,
          binaryArtifact: platform.binaryArtifact,
          installSubpath: `vendor/runtime/${platform.platformId}/gc`,
          assetName,
          checksumAssetName: `${assetName}.sha256`,
          archiveBinarySubpath: 'bin/gc',
        },
      ]
    }),
  )

  return {
    schemaVersion: SINGLE_PACKAGE_MANIFEST_VERSION,
    packageName: ROOT_PACKAGE_NAME,
    version,
    generatedAt,
    releaseTag,
    runtime: {
      baseUrl: runtimeBaseUrl,
      baseUrlEnv: DEFAULT_RUNTIME_BASE_URL_ENV,
      platforms,
    },
    modules,
  }
}

export function createSinglePackageManifest({
  rootPkg,
  version,
  dependencies = {},
}) {
  const platforms = getBinaryNpmReleasePlatforms()
  const supportedOs = [...new Set(platforms.map(platform => platform.os))]
  const supportedCpu = [...new Set(platforms.map(platform => platform.arch))]

  return {
    name: ROOT_PACKAGE_NAME,
    version,
    private: false,
    description: 'Single-package runtime launcher for Gclm Code.',
    type: 'module',
    license: rootPkg.license ?? 'UNLICENSED',
    os: supportedOs,
    cpu: supportedCpu,
    bin: {
      gc: './bin/gc.js',
      claude: './bin/gc.js',
    },
    scripts: {
      postinstall: 'node ./bin/install-runtime.js',
    },
    dependencies,
    files: ['bin', 'vendor', 'README.md'],
  }
}

export function renderSinglePackageReadme(version) {
  return `# ${ROOT_PACKAGE_NAME}\n\nGenerated single-package staging for Gclm Code ${version}.\n`
}

export function copyVendorLauncher({ rootDir, targetPath }) {
  copyFileSync(resolve(rootDir, 'bin', 'gc.js'), targetPath)
}

export function copyRuntimeInstaller({ rootDir, targetPath }) {
  copyFileSync(resolve(rootDir, 'scripts', 'install-runtime.mjs'), targetPath)
}
