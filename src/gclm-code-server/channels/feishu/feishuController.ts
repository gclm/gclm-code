import type { Context } from 'hono'
import type { GclmCodeServerAppState } from '../../app/types.js'
import { FeishuSignatureVerifier } from './feishuSignature.js'

export async function handleFeishuEvent(
  c: Context,
  state: GclmCodeServerAppState,
): Promise<Response> {
  try {
    const rawBody = await c.req.raw.text()
    const payload = JSON.parse(rawBody)
    new FeishuSignatureVerifier(state.env.feishu).verify(c.req.raw.headers, rawBody, payload)
    const result = await state.channels.feishuAdapter.handleEvent(payload)

    if (result.type === 'url_verification') {
      return c.json({ challenge: result.challenge })
    }

    return c.json(result)
  } catch (error) {
    return c.json(
      {
        error: {
          code: 'FEISHU_EVENT_REJECTED',
          message: error instanceof Error ? error.message : 'Rejected Feishu event',
        },
      },
      401,
    )
  }
}

export async function handleFeishuAction(
  c: Context,
  state: GclmCodeServerAppState,
): Promise<Response> {
  try {
    const rawBody = await c.req.raw.text()
    const payload = JSON.parse(rawBody)
    new FeishuSignatureVerifier(state.env.feishu).verify(c.req.raw.headers, rawBody, payload)
    const result = await state.channels.feishuAdapter.handleAction(payload)
    return c.json(result)
  } catch (error) {
    return c.json(
      {
        error: {
          code: 'FEISHU_ACTION_REJECTED',
          message: error instanceof Error ? error.message : 'Rejected Feishu action',
        },
      },
      401,
    )
  }
}
