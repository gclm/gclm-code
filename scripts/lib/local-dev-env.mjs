import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

function parseEnvFile(content) {
  const result = {}
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) {
      continue
    }

    const index = line.indexOf('=')
    if (index <= 0) {
      continue
    }

    const key = line.slice(0, index).trim()
    let value = line.slice(index + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    result[key] = value
  }
  return result
}

export function loadLocalDevEnv(root = process.cwd()) {
  const envFile = join(root, '.local', 'gclm-code-server', 'dev.env')
  mkdirSync(dirname(envFile), { recursive: true })
  if (!existsSync(envFile)) {
    return {}
  }

  return parseEnvFile(readFileSync(envFile, 'utf8'))
}
