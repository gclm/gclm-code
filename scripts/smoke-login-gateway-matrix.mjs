if (typeof Bun === 'undefined') {
  process.stderr.write('Run with Bun: `bun run smoke:login-gateway:matrix`.\n')
  process.exit(1)
}

const baseUrl = process.env.SMOKE_GATEWAY_BASE_URL?.trim()
const apiKey = process.env.SMOKE_GATEWAY_API_KEY?.trim()

if (!baseUrl || !apiKey) {
  process.stderr.write('Missing SMOKE_GATEWAY_BASE_URL or SMOKE_GATEWAY_API_KEY.\n')
  process.exit(1)
}

function normalizeBase(value) {
  return value.replace(/\/+$/, '')
}

function joinSubpath(base, subpath) {
  const normalizedBase = normalizeBase(base)
  const normalizedSubpath = subpath.replace(/^\/+/, '')
  return `${normalizedBase}/${normalizedSubpath}`
}

function runCase(name, env) {
  process.stdout.write(`\n== ${name} ==\n`)
  const proc = Bun.spawn(['bun', 'run', 'smoke:login-gateway'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      ...env,
    },
    stdout: 'pipe',
    stderr: 'pipe',
  })

  return proc.exited.then(async code => {
    const out = await new Response(proc.stdout).text()
    const err = await new Response(proc.stderr).text()

    if (out.trim()) process.stdout.write(`${out.trim()}\n`)
    if (err.trim()) process.stdout.write(`${err.trim()}\n`)

    if (code !== 0) {
      throw new Error(`${name} failed with exit=${String(code)}`)
    }
  })
}

const cases = [
  {
    name: 'success/base-v1',
    env: {
      SMOKE_GATEWAY_BASE_URL: normalizeBase(baseUrl),
      SMOKE_GATEWAY_API_KEY: apiKey,
      SMOKE_GATEWAY_EXPECT_ERROR: '',
    },
  },
  {
    name: 'error/not-found-404',
    env: {
      SMOKE_GATEWAY_BASE_URL: joinSubpath(baseUrl, 'v1/v1'),
      SMOKE_GATEWAY_API_KEY: apiKey,
      SMOKE_GATEWAY_EXPECT_ERROR: '404',
    },
  },
]

if (process.env.SMOKE_GATEWAY_EXPECT_401_KEY?.trim()) {
  cases.push({
    name: 'error/auth-401-403',
    env: {
      SMOKE_GATEWAY_BASE_URL: normalizeBase(baseUrl),
      SMOKE_GATEWAY_API_KEY: process.env.SMOKE_GATEWAY_EXPECT_401_KEY.trim(),
      SMOKE_GATEWAY_EXPECT_ERROR: '401/403',
    },
  })
}

if (process.env.SMOKE_GATEWAY_EXPECT_429_BASE_URL?.trim()) {
  cases.push({
    name: 'error/rate-limit-429',
    env: {
      SMOKE_GATEWAY_BASE_URL: normalizeBase(
        process.env.SMOKE_GATEWAY_EXPECT_429_BASE_URL.trim(),
      ),
      SMOKE_GATEWAY_API_KEY: apiKey,
      SMOKE_GATEWAY_EXPECT_ERROR: '429',
    },
  })
}

if (process.env.SMOKE_GATEWAY_EXPECT_5XX_BASE_URL?.trim()) {
  cases.push({
    name: 'error/gateway-5xx',
    env: {
      SMOKE_GATEWAY_BASE_URL: normalizeBase(
        process.env.SMOKE_GATEWAY_EXPECT_5XX_BASE_URL.trim(),
      ),
      SMOKE_GATEWAY_API_KEY: apiKey,
      SMOKE_GATEWAY_EXPECT_ERROR: 'Gateway is unavailable',
    },
  })
}

for (const testCase of cases) {
  await runCase(testCase.name, testCase.env)
}

process.stdout.write('\nGateway login smoke matrix completed successfully.\n')
