import { spawnSync } from 'node:child_process'
import { fetchGatewayModels } from './lib/gateway-models.mjs'

if (typeof Bun === 'undefined') {
  process.stderr.write('Run with Bun: `bun run smoke`.\n')
  process.exit(1)
}

function run(command, args, env = {}) {
  const r = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: 'pipe',
    env: { ...process.env, ...env },
  })
  return { ...r, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

function mustPass(name, command, args, check, env) {
  const r = run(command, args, env)
  process.stdout.write(`\n== ${name} ==\n`)
  process.stdout.write(`exit: ${String(r.status ?? r.signal ?? 'unknown')}\n`)
  if (r.stdout.trim()) process.stdout.write(`${r.stdout.trim()}\n`)
  if (r.stderr.trim()) process.stdout.write(`${r.stderr.trim()}\n`)
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`${name} failed with ${r.status}`)
  if (check && !check(r)) throw new Error(`${name} output check failed`)
}

mustPass('build', 'bun', ['run', 'build'], r => r.stdout.includes('Built ./gc'))
mustPass('version', './gc', ['--version'], r => r.stdout.length > 0)
mustPass('help', './gc', ['--help'], r => r.stdout.includes('Usage:'))

const gateway = process.env.SMOKE_GATEWAY_BASE_URL
const key = process.env.SMOKE_GATEWAY_API_KEY
if (gateway && key) {
  const { endpoint, models } = await fetchGatewayModels(gateway, key)
  process.stdout.write('\n== gateway-model-discovery ==\n')
  process.stdout.write(`discovered models: ${String(models.length)}\n`)
  process.stdout.write(`endpoint used: ${endpoint}\n`)
}

process.stdout.write('\nSmoke test completed successfully.\n')
