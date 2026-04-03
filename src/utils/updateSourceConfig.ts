const DEFAULT_GCS_BUCKET_URL =
  'https://storage.googleapis.com/claude-code-dist-86c565f3-f756-42ad-8dfa-d59b1c096819/claude-code-releases'

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

/**
 * Keep current warning semantics by default, but allow custom package scopes.
 */
export function isDefaultAnthropicPackage(packageUrl: string): boolean {
  return packageUrl.startsWith('@anthropic')
}

