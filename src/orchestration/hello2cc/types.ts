export type Hello2ccIntentKind =
  | 'implement'
  | 'review'
  | 'verify'
  | 'plan'
  | 'explore'
  | 'general'

export type Hello2ccIntentProfile = {
  rawPrompt: string
  primaryIntent: Hello2ccIntentKind
  signals: {
    implement: boolean
    review: boolean
    verify: boolean
    plan: boolean
    explore: boolean
    externalSystem: boolean
    needTeam: boolean
    needWorktree: boolean
  }
}

export type CapabilitySnapshot = {
  cwd: string
  toolNames: string[]
  supportsAgent: boolean
  supportsTeam: boolean
  supportsMessaging: boolean
  supportsWorktree: boolean
  availableSubagentTypes: string[]
  mcpConnectedCount: number
  mcpPendingCount: number
  mcpNeedsAuthCount: number
  mcpFailedCount: number
  toolSearchOptimistic: boolean
  webSearchAvailable: boolean
  webSearchRequests: number
  provider?: string
  strategyProfile?: 'balanced' | 'strict'
  qualityGateMode?: 'off' | 'advisory' | 'strict'
  providerPoliciesEnabled?: boolean
  agentType?: string
  model?: string
}

export type ToolMemoryRecord = {
  toolName: string
  signature: string
  summary: string
  count: number
  updatedAt: string
}

export type Hello2ccSessionState = {
  sessionId: string
  capabilities: CapabilitySnapshot
  lastIntent?: Hello2ccIntentProfile
  lastRouteGuidance?: string
  activeTeamName?: string
  activeWorktreePath?: string
  toolFailureCounts: Record<string, number>
  recentSuccesses: ToolMemoryRecord[]
  recentFailures: ToolMemoryRecord[]
}

export type PersistedHello2ccSessionState = Hello2ccSessionState

export type NormalizationResult = {
  updatedInput?: Record<string, unknown>
  notes: string[]
}

export type PreconditionCheckResult = {
  blocked: boolean
  reason?: string
  notes: string[]
}
