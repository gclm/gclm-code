import { resetCostState } from '../bootstrap/state.js'
import {
  clearTrustedDeviceToken,
  enrollTrustedDevice,
} from '../bridge/trustedDevice.js'
import { refreshPolicyLimits } from '../services/policyLimits/index.js'
import { refreshRemoteManagedSettings } from '../services/remoteManagedSettings/index.js'
import { refreshGrowthBookAfterAuthChange } from '../services/runtimeConfig/growthbook.js'
import { isFirstPartyAnthropicBaseUrl } from './model/providers.js'
import { resetUserCache } from './user.js'

export function shouldRunAnthropicAccountPostLoginTasks(): boolean {
  return isFirstPartyAnthropicBaseUrl()
}

/**
 * Refresh auth-dependent state after a successful login.
 *
 * Gateway/custom-base-url logins only need local cache resets here; Anthropic
 * account-only services are skipped to avoid unnecessary first-party traffic.
 */
export function runPostLoginEffects(): void {
  resetCostState()
  resetUserCache()

  if (!shouldRunAnthropicAccountPostLoginTasks()) {
    return
  }

  void refreshRemoteManagedSettings()
  void refreshPolicyLimits()
  refreshGrowthBookAfterAuthChange()
  clearTrustedDeviceToken()
  void enrollTrustedDevice()
}
