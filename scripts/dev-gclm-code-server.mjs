import { spawnSync } from 'node:child_process'
import { loadLocalDevEnv } from './lib/local-dev-env.mjs'

const root = process.cwd()
const extraEnv = loadLocalDevEnv(root)
const child = spawnSync('bun', ['./src/entrypoints/gclm-code-server.ts'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    ...extraEnv,
  },
})

if (child.error) {
  process.stderr.write(`${String(child.error)}\n`)
  process.exit(1)
}

process.exit(child.status ?? 0)
