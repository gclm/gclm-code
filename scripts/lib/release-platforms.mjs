import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'

export const ROOT_PACKAGE_NAME = 'gclm-code'

const PLATFORM_CATALOG = Object.freeze({
  'darwin-x64': Object.freeze({
    platformId: 'darwin-x64',
    os: 'darwin',
    arch: 'x64',
    runner: 'macos-15-intel',
    binaryArtifact: 'gc-darwin-x64',
    description: 'macOS x64 binary package for Gclm Code.',
    releaseLabel: 'darwin-x64',
  }),
  'darwin-arm64': Object.freeze({
    platformId: 'darwin-arm64',
    os: 'darwin',
    arch: 'arm64',
    runner: 'macos-15',
    binaryArtifact: 'gc-darwin-arm64',
    description: 'macOS arm64 binary package for Gclm Code.',
    releaseLabel: 'darwin-arm64',
  }),
})

export const ACTIVE_BINARY_NPM_PLATFORM_IDS = Object.freeze([
  'darwin-x64',
  'darwin-arm64',
])

export function getReleasePlatform(platformId) {
  const platform = PLATFORM_CATALOG[platformId]
  if (!platform) {
    throw new Error(`Unknown release platform: ${platformId}`)
  }
  return platform
}

export function getBinaryNpmReleasePlatforms(
  platformIds = ACTIVE_BINARY_NPM_PLATFORM_IDS,
) {
  return platformIds.map(getReleasePlatform)
}

export function getReleasePlatformMatrix(
  platformIds = ACTIVE_BINARY_NPM_PLATFORM_IDS,
) {
  return {
    include: getBinaryNpmReleasePlatforms(platformIds).map(platform => ({
      platform_id: platform.platformId,
      os: platform.os,
      arch: platform.arch,
      runner: platform.runner,
      binary_artifact: platform.binaryArtifact,
      release_label: platform.releaseLabel,
    })),
  }
}

export function createBinaryPathOverrides(
  platformIds = ACTIVE_BINARY_NPM_PLATFORM_IDS,
) {
  return Object.fromEntries(platformIds.map(platformId => [platformId, null]))
}

export function consumePlatformBinaryArg({
  argv,
  index,
  binaries,
  rootDir,
  aliasMap = {},
  platformIds = ACTIVE_BINARY_NPM_PLATFORM_IDS,
}) {
  const arg = argv[index]
  const aliasTarget = aliasMap[arg]
  if (aliasTarget && argv[index + 1]) {
    binaries[aliasTarget] = resolve(rootDir, argv[index + 1])
    return 1
  }

  if (arg !== '--binary' || !argv[index + 1]) {
    return 0
  }

  const spec = argv[index + 1]
  const separatorIndex = spec.indexOf('=')
  if (separatorIndex <= 0 || separatorIndex === spec.length - 1) {
    throw new Error(`Invalid --binary value: ${spec}`)
  }

  const platformId = spec.slice(0, separatorIndex)
  const binaryPath = spec.slice(separatorIndex + 1)
  if (!platformIds.includes(platformId)) {
    throw new Error(`Unknown --binary platform id: ${platformId}`)
  }

  binaries[platformId] = resolve(rootDir, binaryPath)
  return 1
}

export function resolvePlatformBinaryPaths({
  rootDir,
  binaries,
  binaryInputDir = null,
  platformIds = ACTIVE_BINARY_NPM_PLATFORM_IDS,
  defaultBinaryRelativePath = 'gc',
}) {
  const resolvedInputDir = binaryInputDir
    ? resolve(rootDir, binaryInputDir)
    : null

  return Object.fromEntries(
    platformIds.map(platformId => {
      if (binaries[platformId]) {
        return [platformId, binaries[platformId]]
      }

      if (resolvedInputDir) {
        return [
          platformId,
          join(resolvedInputDir, getReleasePlatform(platformId).binaryArtifact),
        ]
      }

      return [platformId, resolve(rootDir, defaultBinaryRelativePath)]
    }),
  )
}

export function ensurePlatformBinaries(
  binaries,
  platformIds = ACTIVE_BINARY_NPM_PLATFORM_IDS,
) {
  for (const platformId of platformIds) {
    const binaryPath = binaries[platformId]
    if (!binaryPath) {
      throw new Error(`Missing binary path for ${platformId}`)
    }
    if (!existsSync(binaryPath)) {
      throw new Error(`Binary for ${platformId} does not exist: ${binaryPath}`)
    }
  }
}
