export type GclmCodeServerEnv = {
  GCLM_CODE_SERVER_DB_PATH: string
  GCLM_CODE_SERVER_DB_BUSY_TIMEOUT_MS: number
}

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback
  }

  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer environment value: ${value}`)
  }
  return parsed
}

export function readGclmCodeServerEnv(
  env: NodeJS.ProcessEnv = process.env,
): GclmCodeServerEnv {
  return {
    GCLM_CODE_SERVER_DB_PATH:
      env.GCLM_CODE_SERVER_DB_PATH ?? './.local/gclm-code-server/dev.db',
    GCLM_CODE_SERVER_DB_BUSY_TIMEOUT_MS: readPositiveInt(
      env.GCLM_CODE_SERVER_DB_BUSY_TIMEOUT_MS,
      5000,
    ),
  }
}
