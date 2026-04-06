import { createHmac, timingSafeEqual } from 'crypto'
import type { ChannelProvider } from '../identity/types.js'

export type StreamTokenPayload = {
  sessionId: string
  userId: string
  channel: ChannelProvider
  exp: number
}

export class StreamInfoService {
  constructor(
    private readonly signingSecret: string,
    private readonly ttlSeconds = 300,
  ) {}

  issueWebSocketToken(input: {
    sessionId: string
    userId: string
    channel: ChannelProvider
    now?: Date
  }): { token: string; expiresAt: string } {
    const now = input.now ?? new Date()
    const exp = Math.floor(now.getTime() / 1000) + this.ttlSeconds
    const payload: StreamTokenPayload = {
      sessionId: input.sessionId,
      userId: input.userId,
      channel: input.channel,
      exp,
    }
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const signature = this.sign(encodedPayload)
    return {
      token: `${encodedPayload}.${signature}`,
      expiresAt: new Date(exp * 1000).toISOString(),
    }
  }

  verifyWebSocketToken(token: string): StreamTokenPayload {
    const [encodedPayload, signature] = token.split('.')
    if (!encodedPayload || !signature) {
      throw new Error('Invalid stream token format')
    }

    const expected = this.sign(encodedPayload)
    if (
      !timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expected),
      )
    ) {
      throw new Error('Invalid stream token signature')
    }

    const payload = JSON.parse(
      Buffer.from(encodedPayload, 'base64url').toString('utf8'),
    ) as StreamTokenPayload

    if (payload.exp * 1000 <= Date.now()) {
      throw new Error('Expired stream token')
    }

    return payload
  }

  private sign(encodedPayload: string): string {
    return createHmac('sha256', this.signingSecret)
      .update(encodedPayload)
      .digest('base64url')
  }
}
