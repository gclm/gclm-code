import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { refreshProviderModelOptions } from '../src/services/api/providerModelDiscovery.ts'
import { getGlobalConfig, saveGlobalConfig } from '../src/utils/config.ts'
import {
  getSettingsForSource,
  replaceSettingsForSource,
  updateSettingsForSource,
} from '../src/utils/settings/settings.ts'

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function withoutGatewayEnvVars(env = {}) {
  const nextEnv = { ...env }
  delete nextEnv.ANTHROPIC_BASE_URL
  delete nextEnv.ANTHROPIC_API_KEY
  delete nextEnv.CLAUDE_CODE_USE_BEDROCK
  delete nextEnv.CLAUDE_CODE_USE_VERTEX
  delete nextEnv.CLAUDE_CODE_USE_FOUNDRY
  return Object.keys(nextEnv).length > 0 ? nextEnv : undefined
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'))
}

async function main() {
  const baseUrl = requireEnv('SMOKE_GATEWAY_BASE_URL')
  const apiKey =
    process.env.SMOKE_GATEWAY_EXPECT_401_KEY?.trim() ||
    requireEnv('SMOKE_GATEWAY_API_KEY')
  const expectedError = process.env.SMOKE_GATEWAY_EXPECT_ERROR?.trim()

  const tempConfigRoot = await mkdtemp(join(tmpdir(), 'gclm-gateway-smoke-'))
  process.env.CLAUDE_CONFIG_DIR = tempConfigRoot
  process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = '1'
  process.env.CLAUDE_CODE_USE_BEDROCK = '1'

  try {
    const unrelatedEnv = {
      CLAUDE_CODE_ATTRIBUTION_HEADER: '0',
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1',
    }

    const saveResult = updateSettingsForSource('userSettings', {
      env: {
        ...unrelatedEnv,
        ANTHROPIC_BASE_URL: baseUrl,
        ANTHROPIC_API_KEY: apiKey,
        CLAUDE_CODE_USE_BEDROCK: undefined,
        CLAUDE_CODE_USE_VERTEX: undefined,
        CLAUDE_CODE_USE_FOUNDRY: undefined,
      },
    })
    if (saveResult.error) {
      throw saveResult.error
    }

    process.env.ANTHROPIC_BASE_URL = baseUrl
    process.env.ANTHROPIC_API_KEY = apiKey
    delete process.env.CLAUDE_CODE_USE_BEDROCK
    delete process.env.CLAUDE_CODE_USE_VERTEX
    delete process.env.CLAUDE_CODE_USE_FOUNDRY

    const savedSettings = getSettingsForSource('userSettings') ?? {}
    if (savedSettings.env?.ANTHROPIC_BASE_URL !== baseUrl) {
      throw new Error('Gateway base URL was not saved to user settings')
    }
    if (savedSettings.env?.ANTHROPIC_API_KEY !== apiKey) {
      throw new Error('Gateway API key was not saved to user settings')
    }
    if ('CLAUDE_CODE_USE_BEDROCK' in (savedSettings.env ?? {})) {
      throw new Error('Gateway login should clear provider mode flags')
    }

    let refreshError = null
    try {
      await refreshProviderModelOptions({ force: true, interactive: true })
    } catch (error) {
      refreshError = error
    }

    if (expectedError) {
      const message = String(refreshError?.message ?? '')
      if (!refreshError || !message.includes(expectedError)) {
        throw new Error(
          `Expected gateway discovery error containing "${expectedError}", got "${message || 'success'}"`,
        )
      }
      process.stdout.write(`gateway-discovery:error:${message}\n`)
    } else {
      if (refreshError) {
        throw refreshError
      }
      const config = getGlobalConfig()
      const models = config.additionalModelOptionsCache ?? []
      if (models.length === 0) {
        throw new Error('Gateway discovery completed without caching models')
      }
      process.stdout.write(
        `gateway-discovery:ok:${models.length}:${config.providerModelDiscoveryLastStatus?.endpoint ?? 'unknown'}\n`,
      )
    }

    const currentUserSettings = getSettingsForSource('userSettings') ?? {}
    const replaceResult = replaceSettingsForSource('userSettings', {
      ...currentUserSettings,
      env: withoutGatewayEnvVars(currentUserSettings.env),
    })
    if (replaceResult.error) {
      throw replaceResult.error
    }

    delete process.env.ANTHROPIC_BASE_URL
    delete process.env.ANTHROPIC_API_KEY

    saveGlobalConfig(current => ({
      ...current,
      additionalModelOptionsCache: [],
      additionalModelOptionsCacheFetchedAt: undefined,
      providerModelDiscoveryLastStatus: undefined,
    }))

    const settingsPath = join(tempConfigRoot, 'settings.json')
    const writtenSettings = await readJson(settingsPath)
    if (writtenSettings.env?.ANTHROPIC_BASE_URL) {
      throw new Error('Gateway base URL still exists after cleanup')
    }
    if (writtenSettings.env?.ANTHROPIC_API_KEY) {
      throw new Error('Gateway API key still exists after cleanup')
    }
    if (
      writtenSettings.env?.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC !== '1' ||
      writtenSettings.env?.CLAUDE_CODE_ATTRIBUTION_HEADER !== '0'
    ) {
      throw new Error('Logout cleanup should preserve unrelated env entries')
    }

    process.stdout.write(`gateway-cleanup:ok:${settingsPath}\n`)
  } finally {
    await rm(tempConfigRoot, { recursive: true, force: true })
  }
}

await main()
