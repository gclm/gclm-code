import { request } from 'node:https'
import { loadLocalDevEnv } from './lib/local-dev-env.mjs'

const root = process.cwd()
const env = {
  ...process.env,
  ...loadLocalDevEnv(root),
}

const enabled = String(env.GCLM_CODE_SERVER_FEISHU_ENABLED ?? 'false').toLowerCase()
if (!['1', 'true', 'yes', 'on'].includes(enabled)) {
  console.error('Feishu smoke skipped: GCLM_CODE_SERVER_FEISHU_ENABLED is not true')
  process.exit(1)
}

const appId = env.GCLM_CODE_SERVER_FEISHU_APP_ID
const appSecret = env.GCLM_CODE_SERVER_FEISHU_APP_SECRET
const baseUrl = env.GCLM_CODE_SERVER_FEISHU_BASE_URL ?? 'https://open.feishu.cn'

if (!appId || !appSecret) {
  console.error(
    'Feishu smoke skipped: missing GCLM_CODE_SERVER_FEISHU_APP_ID or GCLM_CODE_SERVER_FEISHU_APP_SECRET',
  )
  process.exit(1)
}

const url = new URL('/open-apis/auth/v3/tenant_access_token/internal', baseUrl)
const body = JSON.stringify({
  app_id: appId,
  app_secret: appSecret,
})

async function postJson() {
  return await new Promise((resolve, reject) => {
    const req = request(
      url,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'content-length': Buffer.byteLength(body),
        },
      },
      res => {
        let raw = ''
        res.setEncoding('utf8')
        res.on('data', chunk => {
          raw += chunk
        })
        res.on('end', () => {
          try {
            const json = JSON.parse(raw)
            resolve({
              statusCode: res.statusCode ?? 0,
              json,
            })
          } catch (error) {
            reject(
              new Error(
                `Failed to parse Feishu response JSON: ${
                  error instanceof Error ? error.message : String(error)
                }\nRaw: ${raw}`,
              ),
            )
          }
        })
      },
    )

    req.on('error', reject)
    req.write(body)
    req.end()
  })
}

try {
  const response = await postJson()
  const json = response.json
  const ok =
    response.statusCode >= 200 &&
    response.statusCode < 300 &&
    typeof json === 'object' &&
    json !== null &&
    'tenant_access_token' in json

  if (!ok) {
    console.error(
      JSON.stringify(
        {
          ok: false,
          baseUrl,
          statusCode: response.statusCode,
          response: json,
        },
        null,
        2,
      ),
    )
    process.exit(1)
  }

  const typed = json
  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        statusCode: response.statusCode,
        expire: typed.expire ?? null,
        appIdPreview: `${appId.slice(0, 6)}***`,
        tenantAccessTokenPreview:
          typeof typed.tenant_access_token === 'string'
            ? `${typed.tenant_access_token.slice(0, 10)}***`
            : null,
      },
      null,
      2,
    ),
  )
} catch (error) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        baseUrl,
        error: error instanceof Error ? error.message : String(error),
      },
      null,
      2,
    ),
  )
  process.exit(1)
}
