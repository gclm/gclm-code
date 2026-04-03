import { isEnvTruthy } from '../../utils/envUtils.js'
import { isTelemetryDisabled } from '../../utils/privacyLevel.js'

/**
 * Returns true when optional network-side diagnostics and telemetry-like
 * traffic should be suppressed for the current runtime.
 */
export function isNonEssentialTrafficDisabled(): boolean {
  return (
    process.env.NODE_ENV === 'test' ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_BEDROCK) ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_VERTEX) ||
    isEnvTruthy(process.env.CLAUDE_CODE_USE_FOUNDRY) ||
    isTelemetryDisabled()
  )
}
