import { createHash } from 'crypto'
import type { GclmCodeServerFeishuEnv } from '../../config/env.js'

export class FeishuSignatureVerifier {
  constructor(private readonly config: GclmCodeServerFeishuEnv) {}

  verify(headers: Headers, rawBody: string, payload: unknown): void {
    if (!this.config.enabled || this.config.bypassSignatureVerification) {
      return
    }

    this.verifyVerificationToken(payload)
    this.verifyHeaderSignature(headers, rawBody)
  }

  private verifyVerificationToken(payload: unknown): void {
    if (!this.config.verificationToken) {
      return
    }

    if (typeof payload !== 'object' || payload === null) {
      throw new Error('Feishu payload must be an object')
    }

    const token = 'token' in payload ? payload.token : undefined
    if (token !== this.config.verificationToken) {
      throw new Error('Invalid Feishu verification token')
    }
  }

  private verifyHeaderSignature(headers: Headers, rawBody: string): void {
    if (!this.config.encryptKey) {
      return
    }

    const timestamp = headers.get('x-lark-request-timestamp')
    const nonce = headers.get('x-lark-request-nonce')
    const signature = headers.get('x-lark-signature')

    if (!timestamp || !nonce || !signature) {
      throw new Error('Missing Feishu signature headers')
    }

    const digest = createHash('sha256')
      .update(timestamp)
      .update(nonce)
      .update(this.config.encryptKey)
      .update(rawBody)
      .digest('hex')

    if (digest !== signature) {
      throw new Error('Invalid Feishu request signature')
    }
  }
}
