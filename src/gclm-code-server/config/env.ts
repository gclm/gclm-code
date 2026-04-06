export type GclmCodeServerFeishuEnv = {
  enabled: boolean
  baseUrl: string
  appId?: string
  appSecret?: string
  useLongConnection: boolean
  verificationToken?: string
  encryptKey?: string
  bypassSignatureVerification: boolean
}

export type GclmCodeServerEnv = {
  GCLM_CODE_SERVER_HOST: string
  GCLM_CODE_SERVER_PORT: number
  GCLM_CODE_SERVER_SIGNING_SECRET: string
  GCLM_CODE_SERVER_DB_PATH: string
  GCLM_CODE_SERVER_DB_BUSY_TIMEOUT_MS: number
  feishu: GclmCodeServerFeishuEnv
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

function readBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback
  }

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'on'].includes(normalized)) {
    return true
  }
  if (['0', 'false', 'no', 'off'].includes(normalized)) {
    return false
  }
  throw new Error(`Invalid boolean environment value: ${value}`)
}

export function readGclmCodeServerEnv(
  env: NodeJS.ProcessEnv = process.env,
): GclmCodeServerEnv {
  return {
    GCLM_CODE_SERVER_HOST: env.GCLM_CODE_SERVER_HOST ?? '127.0.0.1',
    GCLM_CODE_SERVER_PORT: readPositiveInt(env.GCLM_CODE_SERVER_PORT, 4317),
    GCLM_CODE_SERVER_SIGNING_SECRET:
      env.GCLM_CODE_SERVER_SIGNING_SECRET ?? 'gclm-code-server-dev-secret',
    GCLM_CODE_SERVER_DB_PATH:
      env.GCLM_CODE_SERVER_DB_PATH ?? './.local/gclm-code-server/dev.db',
    GCLM_CODE_SERVER_DB_BUSY_TIMEOUT_MS: readPositiveInt(
      env.GCLM_CODE_SERVER_DB_BUSY_TIMEOUT_MS,
      5000,
    ),
    feishu: {
      enabled: readBoolean(env.GCLM_CODE_SERVER_FEISHU_ENABLED, false),
      baseUrl: env.GCLM_CODE_SERVER_FEISHU_BASE_URL ?? 'https://open.feishu.cn',
      appId: env.GCLM_CODE_SERVER_FEISHU_APP_ID,
      appSecret: env.GCLM_CODE_SERVER_FEISHU_APP_SECRET,
      useLongConnection: readBoolean(
        env.GCLM_CODE_SERVER_FEISHU_USE_LONG_CONNECTION,
        true,
      ),
      verificationToken: env.GCLM_CODE_SERVER_FEISHU_VERIFICATION_TOKEN,
      encryptKey: env.GCLM_CODE_SERVER_FEISHU_ENCRYPT_KEY,
      bypassSignatureVerification: readBoolean(
        env.GCLM_CODE_SERVER_FEISHU_BYPASS_SIGNATURE_VERIFICATION,
        false,
      ),
    },
  }
}
