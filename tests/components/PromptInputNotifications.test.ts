import { describe, expect, test } from 'bun:test'
import { shouldShowVerboseTokenUsage } from '../../src/components/PromptInput/notificationUtils.ts'

describe('shouldShowVerboseTokenUsage', () => {
  test('hides verbose token usage while a turn is loading', () => {
    expect(
      shouldShowVerboseTokenUsage({
        apiKeyStatus: 'verified',
        verbose: true,
        isLoading: true,
      }),
    ).toBe(false)
  })

  test('shows verbose token usage for authenticated idle verbose sessions', () => {
    expect(
      shouldShowVerboseTokenUsage({
        apiKeyStatus: 'verified',
        verbose: true,
        isLoading: false,
      }),
    ).toBe(true)
  })

  test('keeps auth-error states hidden even when verbose is on', () => {
    expect(
      shouldShowVerboseTokenUsage({
        apiKeyStatus: 'missing',
        verbose: true,
        isLoading: false,
      }),
    ).toBe(false)

    expect(
      shouldShowVerboseTokenUsage({
        apiKeyStatus: 'invalid',
        verbose: true,
        isLoading: false,
      }),
    ).toBe(false)
  })
})
