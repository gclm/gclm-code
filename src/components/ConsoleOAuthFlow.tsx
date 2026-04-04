import React, { useCallback, useEffect, useRef, useState } from 'react'
import { type SafeEventValue, logEvent } from 'src/services/analytics/index.js'
import { installOAuthTokens } from '../cli/handlers/auth.js'
import { useTerminalSize } from '../hooks/useTerminalSize.js'
import { setClipboard } from '../ink/termio/osc.js'
import { useTerminalNotification } from '../ink/useTerminalNotification.js'
import { Box, Link, Text } from '../ink.js'
import { useKeybinding } from '../keybindings/useKeybinding.js'
import { getSSLErrorHint } from '../services/api/errorUtils.js'
import { refreshProviderModelOptions } from '../services/api/providerModelDiscovery.js'
import { sendNotification } from '../services/notifier.js'
import { OAuthService } from '../services/oauth/index.js'
import { getOauthAccountInfo, validateForceLoginOrg } from '../utils/auth.js'
import { saveGlobalConfig } from '../utils/config.js'
import { logError } from '../utils/log.js'
import { getSettings_DEPRECATED } from '../utils/settings/settings.js'
import { Select } from './CustomSelect/select.js'
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js'
import { Spinner } from './Spinner.js'
import TextInput from './TextInput.js'

type Props = {
  onDone(): void
  startingMessage?: string
  mode?: 'login' | 'setup-token'
  forceLoginMethod?: 'claudeai' | 'console'
}

type OAuthStatus =
  | { state: 'idle' }
  | { state: 'platform_setup' }
  | { state: 'ready_to_start' }
  | { state: 'waiting_for_login'; url: string }
  | { state: 'creating_api_key' }
  | { state: 'about_to_retry'; nextState: OAuthStatus }
  | { state: 'success'; token?: string }
  | { state: 'error'; message: string; toRetry?: OAuthStatus }

type PlatformStep = 'base_url' | 'api_key'

const PASTE_HERE_MSG = 'Paste code here if prompted > '

function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '')
}

function saveGatewayEnv(baseUrl: string, apiKey: string): void {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)

  // Validate URL eagerly so users get fast feedback in /login.
  // eslint-disable-next-line no-new
  new URL(normalizedBaseUrl)

  saveGlobalConfig(current => {
    const env = { ...(current.env ?? {}) }

    env.ANTHROPIC_BASE_URL = normalizedBaseUrl
    env.ANTHROPIC_API_KEY = apiKey.trim()

    // Gateway routing replaces explicit cloud-provider mode flags.
    delete env.CLAUDE_CODE_USE_BEDROCK
    delete env.CLAUDE_CODE_USE_VERTEX
    delete env.CLAUDE_CODE_USE_FOUNDRY

    return { ...current, env }
  })

  process.env.ANTHROPIC_BASE_URL = normalizedBaseUrl
  process.env.ANTHROPIC_API_KEY = apiKey.trim()
  delete process.env.CLAUDE_CODE_USE_BEDROCK
  delete process.env.CLAUDE_CODE_USE_VERTEX
  delete process.env.CLAUDE_CODE_USE_FOUNDRY
}

export function ConsoleOAuthFlow({
  onDone,
  startingMessage,
  mode = 'login',
  forceLoginMethod: forceLoginMethodProp,
}: Props): React.ReactNode {
  const settings = getSettings_DEPRECATED() || {}
  const forceLoginMethod = forceLoginMethodProp ?? settings.forceLoginMethod
  const orgUUID = settings.forceLoginOrgUUID
  const forcedMethodMessage =
    forceLoginMethod === 'claudeai'
      ? 'Login method pre-selected: Subscription Plan (Claude Pro/Max)'
      : forceLoginMethod === 'console'
        ? 'Login method pre-selected: API Usage Billing (Anthropic Console)'
        : null

  const terminal = useTerminalNotification()
  const [oauthStatus, setOAuthStatus] = useState<OAuthStatus>(() => {
    if (mode === 'setup-token') {
      return { state: 'ready_to_start' }
    }
    if (forceLoginMethod === 'claudeai' || forceLoginMethod === 'console') {
      return { state: 'ready_to_start' }
    }
    return { state: 'idle' }
  })

  const [pastedCode, setPastedCode] = useState('')
  const [cursorOffset, setCursorOffset] = useState(0)
  const [oauthService] = useState(() => new OAuthService())
  const [loginWithClaudeAi, setLoginWithClaudeAi] = useState(
    () => mode === 'setup-token' || forceLoginMethod === 'claudeai',
  )

  const [platformStep, setPlatformStep] = useState<PlatformStep>('base_url')
  const [platformBaseUrl, setPlatformBaseUrl] = useState('')
  const [platformApiKey, setPlatformApiKey] = useState('')

  const [showPastePrompt, setShowPastePrompt] = useState(false)
  const [urlCopied, setUrlCopied] = useState(false)
  const textInputColumns = useTerminalSize().columns - PASTE_HERE_MSG.length - 1

  useEffect(() => {
    if (forceLoginMethod === 'claudeai') {
      logEvent('tengu_oauth_claudeai_forced', {})
    } else if (forceLoginMethod === 'console') {
      logEvent('tengu_oauth_console_forced', {})
    }
  }, [forceLoginMethod])

  useEffect(() => {
    if (oauthStatus.state === 'about_to_retry') {
      const timer = setTimeout(setOAuthStatus, 1000, oauthStatus.nextState)
      return () => clearTimeout(timer)
    }
  }, [oauthStatus])

  useKeybinding(
    'confirm:yes',
    () => {
      logEvent('tengu_oauth_success', { loginWithClaudeAi })
      onDone()
    },
    {
      context: 'Confirmation',
      isActive: oauthStatus.state === 'success' && mode !== 'setup-token',
    },
  )

  useKeybinding(
    'confirm:yes',
    () => {
      if (oauthStatus.state === 'error' && oauthStatus.toRetry) {
        setPastedCode('')
        setOAuthStatus({ state: 'about_to_retry', nextState: oauthStatus.toRetry })
      }
    },
    {
      context: 'Confirmation',
      isActive: oauthStatus.state === 'error' && !!oauthStatus.toRetry,
    },
  )

  useEffect(() => {
    if (
      pastedCode === 'c' &&
      oauthStatus.state === 'waiting_for_login' &&
      showPastePrompt &&
      !urlCopied
    ) {
      void setClipboard(oauthStatus.url).then(raw => {
        if (raw) process.stdout.write(raw)
        setUrlCopied(true)
        setTimeout(setUrlCopied, 2000, false)
      })
      setPastedCode('')
    }
  }, [pastedCode, oauthStatus, showPastePrompt, urlCopied])

  async function handleSubmitCode(value: string, url: string) {
    try {
      const [authorizationCode, state] = value.split('#')
      if (!authorizationCode || !state) {
        setOAuthStatus({
          state: 'error',
          message: 'Invalid code. Please make sure the full code was copied',
          toRetry: { state: 'waiting_for_login', url },
        })
        return
      }

      logEvent('tengu_oauth_manual_entry', {})
      oauthService.handleManualAuthCodeInput({ authorizationCode, state })
    } catch (err: unknown) {
      logError(err)
      setOAuthStatus({
        state: 'error',
        message: (err as Error).message,
        toRetry: { state: 'waiting_for_login', url },
      })
    }
  }

  const startOAuth = useCallback(async () => {
    try {
      logEvent('tengu_oauth_flow_start', { loginWithClaudeAi })

      const result = await oauthService
        .startOAuthFlow(
          async url => {
            setOAuthStatus({ state: 'waiting_for_login', url })
            setTimeout(setShowPastePrompt, 3000, true)
          },
          {
            loginWithClaudeAi,
            inferenceOnly: mode === 'setup-token',
            expiresIn: mode === 'setup-token' ? 365 * 24 * 60 * 60 : undefined,
            orgUUID,
          },
        )
        .catch(err => {
          const isTokenExchangeError = err.message.includes('Token exchange failed')
          const sslHint = getSSLErrorHint(err)
          setOAuthStatus({
            state: 'error',
            message:
              sslHint ??
              (isTokenExchangeError
                ? 'Failed to exchange authorization code for access token. Please try again.'
                : err.message),
            toRetry:
              mode === 'setup-token'
                ? { state: 'ready_to_start' }
                : { state: 'idle' },
          })
          logEvent('tengu_oauth_token_exchange_error', {
            error: err.message,
            ssl_error: sslHint !== null,
          })
          throw err
        })

      if (mode === 'setup-token') {
        setOAuthStatus({ state: 'success', token: result.accessToken })
      } else {
        await installOAuthTokens(result)
        const orgResult = await validateForceLoginOrg()
        if (!orgResult.valid) {
          throw new Error(
            'message' in orgResult ? (orgResult as { message: string }).message : 'Invalid organization',
          )
        }

        setOAuthStatus({ state: 'success' })
        void sendNotification(
          {
            message: 'Gclm Code login successful',
            notificationType: 'auth_success',
          },
          terminal,
        )
      }
    } catch (err) {
      const errorMessage = (err as Error).message
      const sslHint = getSSLErrorHint(err)
      setOAuthStatus({
        state: 'error',
        message: sslHint ?? errorMessage,
        toRetry: { state: mode === 'setup-token' ? 'ready_to_start' : 'idle' },
      })
      logEvent('tengu_oauth_error', {
        error: errorMessage as SafeEventValue,
        ssl_error: sslHint !== null,
      })
    }
  }, [oauthService, setShowPastePrompt, loginWithClaudeAi, mode, orgUUID, terminal])

  const submitPlatformInput = useCallback(async () => {
    try {
      if (platformStep === 'base_url') {
        const normalized = normalizeBaseUrl(platformBaseUrl)
        // eslint-disable-next-line no-new
        new URL(normalized)
        setPlatformBaseUrl(normalized)
        setPlatformStep('api_key')
        setCursorOffset(0)
        return
      }

      if (!platformApiKey.trim()) {
        throw new Error('ANTHROPIC_API_KEY cannot be empty.')
      }

      saveGatewayEnv(platformBaseUrl, platformApiKey)
      logEvent('tengu_oauth_platform_gateway_saved', {})
      await refreshProviderModelOptions({ force: true, interactive: true })

      setOAuthStatus({ state: 'success' })
      void sendNotification(
        {
          message: 'Gateway platform configured successfully',
          notificationType: 'auth_success',
        },
        terminal,
      )
    } catch (err) {
      const message = (err as Error).message || 'Failed to save gateway configuration'
      setOAuthStatus({
        state: 'error',
        message,
        toRetry: { state: 'platform_setup' },
      })
    }
  }, [platformApiKey, platformBaseUrl, platformStep, terminal])

  const pendingOAuthStartRef = useRef(false)
  useEffect(() => {
    if (oauthStatus.state === 'ready_to_start' && !pendingOAuthStartRef.current) {
      pendingOAuthStartRef.current = true
      process.nextTick(
        (
          startOAuthFlow: () => Promise<void>,
          pendingRef: React.MutableRefObject<boolean>,
        ) => {
          void startOAuthFlow()
          pendingRef.current = false
        },
        startOAuth,
        pendingOAuthStartRef,
      )
    }
  }, [oauthStatus.state, startOAuth])

  useEffect(() => {
    if (mode === 'setup-token' && oauthStatus.state === 'success') {
      const timer = setTimeout(
        (loginWithClaudeAiState, done) => {
          logEvent('tengu_oauth_success', { loginWithClaudeAi: loginWithClaudeAiState })
          done()
        },
        500,
        loginWithClaudeAi,
        onDone,
      )
      return () => clearTimeout(timer)
    }
  }, [mode, oauthStatus, loginWithClaudeAi, onDone])

  useEffect(() => {
    return () => {
      oauthService.cleanup()
    }
  }, [oauthService])

  return (
    <Box flexDirection="column" gap={1}>
      {oauthStatus.state === 'waiting_for_login' && showPastePrompt && (
        <Box flexDirection="column" key="urlToCopy" gap={1} paddingBottom={1}>
          <Box paddingX={1}>
            <Text dimColor>Browser didn&apos;t open? Use the url below to sign in </Text>
            {urlCopied ? (
              <Text color="success">(Copied!)</Text>
            ) : (
              <Text dimColor>
                <KeyboardShortcutHint shortcut="c" action="copy" parens />
              </Text>
            )}
          </Box>
          <Link url={oauthStatus.url}>
            <Text dimColor>{oauthStatus.url}</Text>
          </Link>
        </Box>
      )}

      {mode === 'setup-token' && oauthStatus.state === 'success' && oauthStatus.token && (
        <Box key="tokenOutput" flexDirection="column" gap={1} paddingTop={1}>
          <Text color="success">✓ Long-lived authentication token created successfully!</Text>
          <Box flexDirection="column" gap={1}>
            <Text>Your OAuth token (valid for 1 year):</Text>
            <Text color="warning">{oauthStatus.token}</Text>
            <Text dimColor>Store this token securely. You won&apos;t be able to see it again.</Text>
            <Text dimColor>
              Use this token by setting: export CLAUDE_CODE_OAUTH_TOKEN=&lt;token&gt;
            </Text>
          </Box>
        </Box>
      )}

      <Box paddingLeft={1} flexDirection="column" gap={1}>
        <OAuthStatusMessage
          oauthStatus={oauthStatus}
          mode={mode}
          startingMessage={startingMessage}
          forcedMethodMessage={forcedMethodMessage}
          showPastePrompt={showPastePrompt}
          pastedCode={pastedCode}
          setPastedCode={setPastedCode}
          cursorOffset={cursorOffset}
          setCursorOffset={setCursorOffset}
          textInputColumns={textInputColumns}
          handleSubmitCode={handleSubmitCode}
          setOAuthStatus={setOAuthStatus}
          setLoginWithClaudeAi={setLoginWithClaudeAi}
          platformStep={platformStep}
          platformBaseUrl={platformBaseUrl}
          platformApiKey={platformApiKey}
          setPlatformBaseUrl={setPlatformBaseUrl}
          setPlatformApiKey={setPlatformApiKey}
          submitPlatformInput={submitPlatformInput}
        />
      </Box>
    </Box>
  )
}

type OAuthStatusMessageProps = {
  oauthStatus: OAuthStatus
  mode: 'login' | 'setup-token'
  startingMessage: string | undefined
  forcedMethodMessage: string | null
  showPastePrompt: boolean
  pastedCode: string
  setPastedCode: (value: string) => void
  cursorOffset: number
  setCursorOffset: (offset: number) => void
  textInputColumns: number
  handleSubmitCode: (value: string, url: string) => void
  setOAuthStatus: (status: OAuthStatus) => void
  setLoginWithClaudeAi: (value: boolean) => void
  platformStep: PlatformStep
  platformBaseUrl: string
  platformApiKey: string
  setPlatformBaseUrl: (value: string) => void
  setPlatformApiKey: (value: string) => void
  submitPlatformInput: () => Promise<void>
}

function OAuthStatusMessage({
  oauthStatus,
  mode,
  startingMessage,
  forcedMethodMessage,
  showPastePrompt,
  pastedCode,
  setPastedCode,
  cursorOffset,
  setCursorOffset,
  textInputColumns,
  handleSubmitCode,
  setOAuthStatus,
  setLoginWithClaudeAi,
  platformStep,
  platformBaseUrl,
  platformApiKey,
  setPlatformBaseUrl,
  setPlatformApiKey,
  submitPlatformInput,
}: OAuthStatusMessageProps): React.ReactNode {
  switch (oauthStatus.state) {
    case 'idle':
      return (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text bold>
            {startingMessage
              ? startingMessage
              : 'Gclm Code can be used with your Claude subscription or billed based on API usage through your Console account.'}
          </Text>

          <Text>Select login method:</Text>

          <Box>
            <Select
              options={[
                {
                  label: (
                    <Text>
                      Claude account with subscription ·{' '}
                      <Text dimColor>Pro, Max, Team, or Enterprise</Text>
                      {'\n'}
                    </Text>
                  ),
                  value: 'claudeai',
                },
                {
                  label: (
                    <Text>
                      Anthropic Console account · <Text dimColor>API usage billing</Text>
                      {'\n'}
                    </Text>
                  ),
                  value: 'console',
                },
                {
                  label: (
                    <Text>
                      Gateway platform ·{' '}
                      <Text dimColor>Configure ANTHROPIC_BASE_URL / ANTHROPIC_API_KEY</Text>
                      {'\n'}
                    </Text>
                  ),
                  value: 'platform',
                },
              ]}
              onChange={value => {
                if (value === 'platform') {
                  logEvent('tengu_oauth_platform_selected', {})
                  setOAuthStatus({ state: 'platform_setup' })
                  return
                }

                setOAuthStatus({ state: 'ready_to_start' })
                if (value === 'claudeai') {
                  logEvent('tengu_oauth_claudeai_selected', {})
                  setLoginWithClaudeAi(true)
                } else {
                  logEvent('tengu_oauth_console_selected', {})
                  setLoginWithClaudeAi(false)
                }
              }}
            />
          </Box>
        </Box>
      )

    case 'platform_setup':
      return (
        <Box flexDirection="column" gap={1} marginTop={1}>
          <Text bold>Configure Gateway Platform</Text>
          <Text dimColor>
            This saves gateway settings to local config and enables model discovery via
            conditional endpoint mapping: base URL -> /v1/models, and base URL ending in /vN -> /models.
          </Text>

          {platformStep === 'base_url' ? (
            <>
              <Text>Enter ANTHROPIC_BASE_URL:</Text>
              <Box>
                <Text>{'ANTHROPIC_BASE_URL > '}</Text>
                <TextInput
                  value={platformBaseUrl}
                  onChange={setPlatformBaseUrl}
                  onSubmit={() => {
                    void submitPlatformInput()
                  }}
                  cursorOffset={cursorOffset}
                  onChangeCursorOffset={setCursorOffset}
                  columns={Math.max(20, textInputColumns - 18)}
                />
              </Box>
            </>
          ) : (
            <>
              <Text>Enter ANTHROPIC_API_KEY:</Text>
              <Box>
                <Text>{'ANTHROPIC_API_KEY > '}</Text>
                <TextInput
                  value={platformApiKey}
                  onChange={setPlatformApiKey}
                  onSubmit={() => {
                    void submitPlatformInput()
                  }}
                  cursorOffset={cursorOffset}
                  onChangeCursorOffset={setCursorOffset}
                  columns={Math.max(20, textInputColumns - 18)}
                  mask="*"
                />
              </Box>
              <Text dimColor>
                Press Enter to save. Existing provider flags will be cleared for gateway mode.
              </Text>
            </>
          )}
        </Box>
      )

    case 'waiting_for_login':
      return (
        <Box flexDirection="column" gap={1}>
          {forcedMethodMessage && (
            <Box>
              <Text dimColor>{forcedMethodMessage}</Text>
            </Box>
          )}
          {!showPastePrompt && (
            <Box>
              <Spinner />
              <Text>Opening browser to sign in…</Text>
            </Box>
          )}
          {showPastePrompt && (
            <Box>
              <Text>{PASTE_HERE_MSG}</Text>
              <TextInput
                value={pastedCode}
                onChange={setPastedCode}
                onSubmit={value => handleSubmitCode(value, oauthStatus.url)}
                cursorOffset={cursorOffset}
                onChangeCursorOffset={setCursorOffset}
                columns={textInputColumns}
                mask="*"
              />
            </Box>
          )}
        </Box>
      )

    case 'creating_api_key':
      return (
        <Box flexDirection="column" gap={1}>
          <Box>
            <Spinner />
            <Text>Creating API key for Gclm Code…</Text>
          </Box>
        </Box>
      )

    case 'about_to_retry':
      return (
        <Box flexDirection="column" gap={1}>
          <Text color="permission">Retrying…</Text>
        </Box>
      )

    case 'success':
      return (
        <Box flexDirection="column">
          {mode === 'setup-token' && oauthStatus.token ? null : (
            <>
              {getOauthAccountInfo()?.emailAddress ? (
                <Text dimColor>
                  Logged in as <Text>{getOauthAccountInfo()?.emailAddress}</Text>
                </Text>
              ) : null}
              <Text color="success">
                Login successful. Press <Text bold>Enter</Text> to continue…
              </Text>
            </>
          )}
        </Box>
      )

    case 'error':
      return (
        <Box flexDirection="column" gap={1}>
          <Text color="error">OAuth error: {oauthStatus.message}</Text>
          {oauthStatus.toRetry && (
            <Box marginTop={1}>
              <Text color="permission">
                Press <Text bold>Enter</Text> to retry.
              </Text>
            </Box>
          )}
        </Box>
      )

    default:
      return null
  }
}
