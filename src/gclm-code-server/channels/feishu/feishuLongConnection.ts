import type { GclmCodeServerAppState } from '../../app/types.js'

type FeishuLongConnectionSdk = {
  EventDispatcher: new (options?: Record<string, unknown>) => {
    register(handlers: Record<string, (payload: unknown) => Promise<void> | void>): void
  }
  WSClient: new (options: { appId: string; appSecret: string }) => {
    start(input: { eventDispatcher: unknown }): Promise<void>
    close?: () => void
  }
}

type FeishuLongConnectionDeps = {
  sdkFactory?: () => Promise<FeishuLongConnectionSdk>
  logger?: Pick<Console, 'info' | 'warn' | 'error'>
}

export class FeishuLongConnection {
  private wsClient: { start(input: { eventDispatcher: unknown }): Promise<void>; close?: () => void }
    | null = null
  private started = false
  private readonly sdkFactory: () => Promise<FeishuLongConnectionSdk>
  private readonly logger: Pick<Console, 'info' | 'warn' | 'error'>

  constructor(
    private readonly state: GclmCodeServerAppState,
    deps: FeishuLongConnectionDeps = {},
  ) {
    this.sdkFactory =
      deps.sdkFactory ??
      (async () => {
        return await import('@larksuiteoapi/node-sdk')
      })
    this.logger = deps.logger ?? console
  }

  async start(): Promise<void> {
    const config = this.state.env.feishu
    if (
      this.started ||
      !config.enabled ||
      !config.useLongConnection ||
      !config.appId ||
      !config.appSecret
    ) {
      return
    }

    const sdk = await this.sdkFactory()
    const dispatcher = new sdk.EventDispatcher({
      ...(config.verificationToken ? { verificationToken: config.verificationToken } : {}),
      ...(config.encryptKey ? { encryptKey: config.encryptKey } : {}),
    })

    dispatcher.register({
      'im.message.receive_v1': async payload => {
        await this.state.channels.feishuAdapter.handleLongConnectionMessageEvent(payload)
      },
      'card.action.trigger': async payload => {
        await this.state.channels.feishuAdapter.handleLongConnectionActionEvent(payload)
      },
    })

    this.wsClient = new sdk.WSClient({
      appId: config.appId,
      appSecret: config.appSecret,
    })
    await this.wsClient.start({ eventDispatcher: dispatcher })
    this.started = true
    this.logger.info('[gclm-code-server] Feishu long connection started')
  }

  async stop(): Promise<void> {
    if (!this.wsClient) {
      return
    }

    try {
      this.wsClient.close?.()
    } catch (error) {
      this.logger.warn(
        `[gclm-code-server] failed to close Feishu long connection: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
    }
    this.wsClient = null
    this.started = false
  }
}
