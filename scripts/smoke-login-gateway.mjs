if (typeof Bun === 'undefined') {
  process.stderr.write('Run with Bun: `bun run smoke:login-gateway`.\n')
  process.exit(1)
}

// Needed for test script imports that touch config.ts before main bootstrap.
process.env.NODE_ENV = process.env.NODE_ENV || 'test'

const baseUrl = process.env.SMOKE_GATEWAY_BASE_URL?.trim()
const apiKey = process.env.SMOKE_GATEWAY_API_KEY?.trim()
const expectError = process.env.SMOKE_GATEWAY_EXPECT_ERROR?.trim()

if (!baseUrl || !apiKey) {
  process.stderr.write('Missing SMOKE_GATEWAY_BASE_URL or SMOKE_GATEWAY_API_KEY.\n')
  process.exit(1)
}

const normalizeBaseUrl = value => value.replace(/\/+$/, '')
const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
new URL(normalizedBaseUrl)

const { saveGlobalConfig, getGlobalConfig } = await import('../src/utils/config.ts')
const { refreshProviderModelOptions } = await import('../src/services/api/providerModelDiscovery.ts')

// Mirror ConsoleOAuthFlow.saveGatewayEnv behavior.
saveGlobalConfig(current => {
  const env = { ...(current.env ?? {}) }
  env.ANTHROPIC_BASE_URL = normalizedBaseUrl
  env.ANTHROPIC_API_KEY = apiKey
  delete env.CLAUDE_CODE_USE_BEDROCK
  delete env.CLAUDE_CODE_USE_VERTEX
  delete env.CLAUDE_CODE_USE_FOUNDRY
  return { ...current, env }
})

process.env.ANTHROPIC_BASE_URL = normalizedBaseUrl
process.env.ANTHROPIC_API_KEY = apiKey

delete process.env.CLAUDE_CODE_USE_BEDROCK
delete process.env.CLAUDE_CODE_USE_VERTEX
delete process.env.CLAUDE_CODE_USE_FOUNDRY

try {
  await refreshProviderModelOptions({ force: true, interactive: true })

  if (expectError) {
    throw new Error(`Expected error containing "${expectError}" but discovery succeeded`)
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  if (!expectError) {
    throw error
  }
  if (!message.includes(expectError)) {
    throw new Error(
      `Expected error containing "${expectError}", but got: ${message}`,
    )
  }
  process.stdout.write(`Gateway login-path expected error matched: ${message}\n`)
  process.exit(0)
}

const config = getGlobalConfig()
const discovered = config.additionalModelOptionsCache ?? []
if (!Array.isArray(discovered) || discovered.length === 0) {
  throw new Error('Gateway login-path validation failed: no discovered models cached')
}

const sample = discovered.slice(0, 3).map(x => x.value).join(', ')
process.stdout.write(`Gateway login-path validation passed. discovered=${discovered.length} sample=[${sample}]\n`)
