import { readGclmCodeServerEnv } from '../gclm-code-server/config/env.js'
import { startGclmCodeServer } from '../gclm-code-server/app/server.js'

const env = readGclmCodeServerEnv()

const runtime = startGclmCodeServer({
  host: env.GCLM_CODE_SERVER_HOST,
  port: env.GCLM_CODE_SERVER_PORT,
  signingSecret: env.GCLM_CODE_SERVER_SIGNING_SECRET,
  env,
})

function shutdown(signal: string) {
  console.log(`[gclm-code-server] received ${signal}, shutting down`)
  runtime.stop()
  process.exit(0)
}

process.on('SIGINT', () => shutdown('SIGINT'))
process.on('SIGTERM', () => shutdown('SIGTERM'))
