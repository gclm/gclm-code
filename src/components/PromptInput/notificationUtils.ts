import type { VerificationStatus } from '../../hooks/useApiKeyVerification.js'

type VerboseTokenUsageVisibility = {
  apiKeyStatus: VerificationStatus
  verbose: boolean
  isLoading?: boolean
}

export function shouldShowVerboseTokenUsage({
  apiKeyStatus,
  verbose,
  isLoading = false,
}: VerboseTokenUsageVisibility): boolean {
  return (
    apiKeyStatus !== 'invalid' &&
    apiKeyStatus !== 'missing' &&
    verbose &&
    !isLoading
  )
}
