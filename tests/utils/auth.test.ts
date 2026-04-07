import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { getIsInteractive, setIsInteractive } from '../../src/bootstrap/state.ts'
import {
  approveCustomApiKey,
  getAnthropicApiKeyWithSource,
  isCustomApiKeyApproved,
} from '../../src/utils/auth.ts'
import {
  _setGlobalConfigCacheForTesting,
  enableConfigs,
  saveGlobalConfig,
} from '../../src/utils/config.ts'
import { getGlobalClaudeFile } from '../../src/utils/env.ts'
import { getClaudeConfigHomeDir } from '../../src/utils/envUtils.ts'

describe('auth custom API key approval', () => {
  const originalNodeEnv = process.env.NODE_ENV
  const originalConfigDir = process.env.CLAUDE_CONFIG_DIR
  const originalApiKey = process.env.ANTHROPIC_API_KEY
  const originalIsInteractive = getIsInteractive()
  let tempConfigDir: string

  beforeEach(() => {
    tempConfigDir = mkdtempSync(join(tmpdir(), 'gclm-auth-test-'))

    process.env.NODE_ENV = 'development'
    process.env.CLAUDE_CONFIG_DIR = tempConfigDir
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key'
    delete process.env.ANTHROPIC_AUTH_TOKEN
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR
    delete process.env.CLAUDE_CODE_USE_BEDROCK
    delete process.env.CLAUDE_CODE_USE_VERTEX
    delete process.env.CLAUDE_CODE_USE_FOUNDRY
    delete process.env.CLAUDE_CODE_REMOTE
    delete process.env.CLAUDE_CODE_ENTRYPOINT
    delete process.env.CI
    setIsInteractive(true)

    getClaudeConfigHomeDir.cache.clear?.()
    ;(getGlobalClaudeFile as typeof getGlobalClaudeFile & {
      cache?: { clear?: () => void }
    }).cache?.clear?.()
    _setGlobalConfigCacheForTesting(null)
    enableConfigs()

    saveGlobalConfig(current => ({
      ...current,
      customApiKeyResponses: {
        approved: [],
        rejected: [],
      },
      primaryApiKey: undefined,
    }))
  })

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv
    setIsInteractive(originalIsInteractive)

    if (originalConfigDir === undefined) {
      delete process.env.CLAUDE_CONFIG_DIR
    } else {
      process.env.CLAUDE_CONFIG_DIR = originalConfigDir
    }

    if (originalApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = originalApiKey
    }

    getClaudeConfigHomeDir.cache.clear?.()
    ;(getGlobalClaudeFile as typeof getGlobalClaudeFile & {
      cache?: { clear?: () => void }
    }).cache?.clear?.()
    _setGlobalConfigCacheForTesting(null)
    rmSync(tempConfigDir, { recursive: true, force: true })
  })

  test('does not accept ANTHROPIC_API_KEY until it has been approved', () => {
    expect(isCustomApiKeyApproved(process.env.ANTHROPIC_API_KEY!)).toBe(false)
    expect(getAnthropicApiKeyWithSource()).toEqual({
      key: null,
      source: 'none',
    })
  })

  test('accepts an approved ANTHROPIC_API_KEY and removes prior rejection', () => {
    saveGlobalConfig(current => ({
      ...current,
      customApiKeyResponses: {
        approved: [],
        rejected: ['sk-ant-test-key'],
      },
    }))

    approveCustomApiKey(process.env.ANTHROPIC_API_KEY!)

    expect(isCustomApiKeyApproved(process.env.ANTHROPIC_API_KEY!)).toBe(true)
    expect(getAnthropicApiKeyWithSource()).toEqual({
      key: 'sk-ant-test-key',
      source: 'ANTHROPIC_API_KEY',
    })
  })
})
