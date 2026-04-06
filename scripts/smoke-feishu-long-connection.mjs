import https from 'node:https'
import { loadLocalDevEnv } from './lib/local-dev-env.mjs'

const root = process.cwd()
const env = {
  ...process.env,
  ...loadLocalDevEnv(root),
}

const appId = env.GCLM_CODE_SERVER_FEISHU_APP_ID
const appSecret = env.GCLM_CODE_SERVER_FEISHU_APP_SECRET

if (!appId || !appSecret) {
  process.stderr.write(
    JSON.stringify(
      {
        ok: false,
        reason: 'missing_credentials',
        hint: '请先在 .local/gclm-code-server/dev.env 配置飞书 appId/appSecret',
      },
      null,
      2,
    ) + '\n',
  )
  process.exit(1)
}

const body = JSON.stringify({
  AppID: appId,
  AppSecret: appSecret,
})

const result = await new Promise((resolve, reject) => {
  const req = https.request(
    'https://open.feishu.cn/callback/ws/endpoint',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    res => {
      let raw = ''
      res.on('data', chunk => {
        raw += String(chunk)
      })
      res.on('end', () => {
        try {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: JSON.parse(raw),
          })
        } catch (error) {
          reject(error)
        }
      })
    },
  )

  req.on('error', reject)
  req.write(body)
  req.end()
})

const response = result
const payload = typeof response === 'object' && response !== null ? response : {}
const bodyJson =
  typeof payload === 'object' && payload !== null && 'body' in payload
    ? payload.body
    : undefined
const code =
  typeof bodyJson === 'object' && bodyJson !== null && 'code' in bodyJson
    ? bodyJson.code
    : undefined

const summary =
  code === 0
    ? '飞书长连接握手凭证正常，可继续启动 gclm-code-server 实例。'
    : code === 1000040350
      ? '飞书返回长连接数超限：当前 app 的持久连接已被其他实例占用，请先关闭其他长连接客户端后重试。'
      : '飞书长连接探测未通过，请检查应用事件订阅模式、凭证或飞书开放平台状态。'

process.stdout.write(
  JSON.stringify(
    {
      ok: code === 0,
      summary,
      ...payload,
    },
    null,
    2,
  ) + '\n',
)

process.exit(code === 0 ? 0 : 1)
