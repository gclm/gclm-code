import type { Context } from 'hono'
import { FeishuAdapter } from './feishuAdapter.js'
import type { GclmCodeServerAppState } from '../../app/types.js'

export async function handleFeishuEvent(
  c: Context,
  state: GclmCodeServerAppState,
): Promise<Response> {
  const adapter = new FeishuAdapter(state)
  const result = await adapter.handleEvent(await c.req.json())

  if (result.type === 'url_verification') {
    return c.json({ challenge: result.challenge })
  }

  return c.json(result)
}

export async function handleFeishuAction(
  c: Context,
  state: GclmCodeServerAppState,
): Promise<Response> {
  const adapter = new FeishuAdapter(state)
  const result = await adapter.handleAction(await c.req.json())
  return c.json(result)
}
