import type { Context, Next } from 'hono'

const TOKEN_COOKIE_NAME = 'gclm_token'

const UNAUTHORIZED_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>gclm-code-server — Unauthorized</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #1a1a2e; color: #eee; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; }
  .card { background: #16213e; border-radius: 12px; padding: 32px; max-width: 400px; width: 90%; box-shadow: 0 8px 32px rgba(0,0,0,0.3); }
  h1 { font-size: 1.2rem; margin-bottom: 16px; color: #e94560; }
  form { display: flex; gap: 8px; }
  input { flex: 1; padding: 10px 14px; border: 1px solid #0f3460; border-radius: 6px; background: #1a1a2e; color: #eee; font-size: 14px; outline: none; }
  input:focus { border-color: #e94560; }
  button { padding: 10px 20px; background: #e94560; color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; white-space: nowrap; }
  button:hover { background: #c73651; }
</style>
</head>
<body>
<div class="card">
  <h1>Authentication Required</h1>
  <form onsubmit="const v=this.t.value;const url=new URL(location.href);url.searchParams.set('token',v);location.href=url.toString();return false">
    <input name="t" type="password" placeholder="Enter access token" autofocus>
    <button type="submit">Login</button>
  </form>
</div>
</body>
</html>`

export function createAuthMiddleware(accessToken: string, authEnabled: boolean) {
  return async (c: Context, next: Next) => {
    if (!authEnabled) {
      return next()
    }

    // /api/v1/status is always public
    const pathname = new URL(c.req.url).pathname
    if (pathname === '/api/v1/status') {
      return next()
    }

    let token = ''

    // 1. Authorization: Bearer header
    const authHeader = c.req.header('Authorization')
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7)
    }

    // 2. ?token= query parameter
    if (!token) {
      token = c.req.query('token') ?? ''
    }

    // 3. gclm_token cookie
    if (!token) {
      token = getCookieValue(c.req.header('Cookie'), TOKEN_COOKIE_NAME) ?? ''
    }

    if (token !== accessToken) {
      const accept = c.req.header('Accept') ?? ''
      if (accept.includes('text/html')) {
        return c.html(UNAUTHORIZED_HTML, 401)
      }
      return c.json(
        {
          ok: false,
          error: {
            code: 'UNAUTHORIZED',
            message: 'Invalid or missing access token',
          },
          timestamp: new Date().toISOString(),
        },
        401,
      )
    }

    // Set cookie so browser AJAX/WebSocket requests authenticate automatically
    c.header(
      'Set-Cookie',
      `${TOKEN_COOKIE_NAME}=${accessToken}; Path=/; SameSite=Lax`,
    )

    return next()
  }
}

function getCookieValue(
  cookieHeader: string | undefined,
  name: string,
): string | undefined {
  if (!cookieHeader) return undefined
  const match = cookieHeader.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]*)`),
  )
  return match?.[1]
}
