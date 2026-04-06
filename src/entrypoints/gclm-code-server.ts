import { readGclmCodeServerEnv } from '../gclm-code-server/config/env.js'
import { startGclmCodeServer } from '../gclm-code-server/app/server.js'

const env = readGclmCodeServerEnv()
const host = env.GCLM_CODE_SERVER_HOST
const port = env.GCLM_CODE_SERVER_PORT

const runtime = startGclmCodeServer({
  host,
  port,
  signingSecret: env.GCLM_CODE_SERVER_SIGNING_SECRET,
  env,
})

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
