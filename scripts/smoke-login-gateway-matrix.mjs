import { spawnSync } from 'node:child_process'

const root = process.cwd()

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}

function runCase(label, env) {
  const result = spawnSync('bun', ['scripts/smoke-login-gateway.mjs'], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
    env: {
      ...process.env,
      ...env,
    },
  })

  process.stdout.write(`\n== ${label} ==\n`)
  process.stdout.write(`exit: ${String(result.status ?? result.signal ?? 'unknown')}\n`)
  if (result.stdout?.trim()) process.stdout.write(`${result.stdout.trim()}\n`)
  if (result.stderr?.trim()) process.stdout.write(`${result.stderr.trim()}\n`)

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status}`)
  }
}

const successBaseUrl = requireEnv('SMOKE_GATEWAY_BASE_URL')
const successApiKey = requireEnv('SMOKE_GATEWAY_API_KEY')

runCase('gateway-success', {
  SMOKE_GATEWAY_BASE_URL: successBaseUrl,
  SMOKE_GATEWAY_API_KEY: successApiKey,
})

runCase('gateway-404-mapping', {
  SMOKE_GATEWAY_BASE_URL: `${successBaseUrl.replace(/\/+$/, '')}/v1`,
  SMOKE_GATEWAY_API_KEY: successApiKey,
  SMOKE_GATEWAY_EXPECT_ERROR: '404',
})
