const DEFAULT_GCS_BUCKET_URL =
  'https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases'

const DEFAULT_CLI_COMMAND = 'gc'
const DEFAULT_CLI_NAME = 'Gclm'
const DEFAULT_CLI_DISPLAY_NAME = 'Gclm Code'

const DEFAULT_HOMEBREW_UPGRADE_COMMAND = 'brew upgrade gclm-code'
const DEFAULT_WINGET_UPGRADE_COMMAND = 'winget upgrade Gclm.GclmCode'
const DEFAULT_APK_UPGRADE_COMMAND = 'apk upgrade gclm-code'

/**
 * Canonical package URL used by updater flows. Can be overridden for
 * self-hosted distributions without changing call sites.
 */
export function getUpdatePackageUrl(): string {
  return process.env.GCLM_UPDATE_PACKAGE_URL || MACRO.PACKAGE_URL
}

/**
 * Native package URL used by native rollback/version-history flows.
 */
export function getNativeUpdatePackageUrl(): string {
  return process.env.GCLM_NATIVE_UPDATE_PACKAGE_URL ||
    MACRO.NATIVE_PACKAGE_URL ||
    getUpdatePackageUrl()
}

/**
 * Channel pointer source for non-npm installations.
 */
export function getUpdateGcsBucketUrl(): string {
  return process.env.GCLM_UPDATE_GCS_BUCKET_URL || DEFAULT_GCS_BUCKET_URL
}

export function getCliCommand(): string {
  return process.env.GCLM_CLI_COMMAND || DEFAULT_CLI_COMMAND
}

export function getCliName(): string {
  return process.env.GCLM_CLI_NAME || DEFAULT_CLI_NAME
}

export function getCliDisplayName(): string {
  return process.env.GCLM_CLI_DISPLAY_NAME || DEFAULT_CLI_DISPLAY_NAME
}

export function getHomebrewUpgradeCommand(): string {
  return (
    process.env.GCLM_HOMEBREW_UPGRADE_COMMAND ||
    DEFAULT_HOMEBREW_UPGRADE_COMMAND
  )
}

export function getWingetUpgradeCommand(): string {
  return (
    process.env.GCLM_WINGET_UPGRADE_COMMAND || DEFAULT_WINGET_UPGRADE_COMMAND
  )
}

export function getApkUpgradeCommand(): string {
  return process.env.GCLM_APK_UPGRADE_COMMAND || DEFAULT_APK_UPGRADE_COMMAND
}

/**
 * Keep current warning semantics by default, but allow custom package scopes.
 */
export function isDefaultAnthropicPackage(packageUrl: string): boolean {
  return packageUrl.startsWith('@anthropic')
}
