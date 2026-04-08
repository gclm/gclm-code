export type ChannelProvider = 'web' | 'feishu' | 'dingtalk' | 'wecom' | 'api' | 'system'

export type ChannelIdentity = {
  id: string
  userId: string
  provider: ChannelProvider
  providerUserId: string
  tenantScope: string
  tenantId?: string
  displayName?: string
  profileJson?: string
  createdAt: string
  updatedAt: string
}
