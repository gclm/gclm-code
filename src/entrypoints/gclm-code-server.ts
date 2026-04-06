import { startGclmCodeServer } from '../gclm-code-server/app/server.js'

function readPort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid GCLM_CODE_SERVER_PORT: ${value}`)
  }
  return parsed
}

const host = process.env.GCLM_CODE_SERVER_HOST ?? '127.0.0.1'
const port = readPort(process.env.GCLM_CODE_SERVER_PORT, 4317)
const signingSecret =
  process.env.GCLM_CODE_SERVER_SIGNING_SECRET ?? 'gclm-code-server-dev-secret'

const runtime = startGclmCodeServer({ host, port, signingSecret })

console.log(
  `[gclm-code-server] listening on http://${host}:${port} (console: http://${host}:${port}/console)`,
)

function shutdown(signal: string) {
  console.log(`[gclm-code-server] received ${signal}, shutting down`)
  runtime.stop()
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
