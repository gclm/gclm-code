import { spawnSync } from 'node:child_process'

const root = process.cwd()

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

const envBaseUrl = process.env.SMOKE_GATEWAY_BASE_URL?.trim()
const envApiKey = process.env.SMOKE_GATEWAY_API_KEY?.trim()

runCase('gateway-success', {
  ...(envBaseUrl ? { SMOKE_GATEWAY_BASE_URL: envBaseUrl } : {}),
  ...(envApiKey ? { SMOKE_GATEWAY_API_KEY: envApiKey } : {}),
})

runCase('gateway-404-mapping', {
  ...(envBaseUrl
    ? { SMOKE_GATEWAY_BASE_URL: `${envBaseUrl.replace(/\/+$/, '')}/v1` }
    : {}),
  ...(envApiKey ? { SMOKE_GATEWAY_API_KEY: envApiKey } : {}),
  SMOKE_GATEWAY_EXPECT_ERROR: '404',
})
