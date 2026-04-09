export type Hello2ccIntentKind =
  | 'implement'
  | 'review'
  | 'verify'
  | 'plan'
  | 'explore'
  | 'compare'
  | 'release'
  | 'capability'
  | 'research'
  | 'explain'
  | 'current_info'
  | 'general'

export type Hello2ccRole =
  | 'direct_executor'
  | 'planner'
  | 'researcher'
  | 'reviewer'
  | 'team_lead'
  | 'teammate'
  | 'general_operator'

export type PromptEnvelope = {
  charCount: number
  lineCount: number
  clauseCount: number
  questionLike: boolean
  listLike: boolean
  structuredArtifact: boolean
  knownSurfaceMentioned: boolean
  structuralComplexity: boolean
  pathArtifactCount: number
  targetedArtifactQuestion: boolean
  broadArtifactQuestion: boolean
  reviewArtifact: boolean
  repoArtifactHeavy: boolean
  optionPairLike: boolean
}

export type Hello2ccIntentSignals = {
  implement: boolean
  review: boolean
  verify: boolean
  plan: boolean
  explore: boolean
  compare: boolean
  release: boolean
  explain: boolean
  research: boolean
  currentInfo: boolean
  capability: boolean
  externalSystem: boolean
  needTeam: boolean
  needWorktree: boolean
  continuation: boolean
  boundedImplementation: boolean
  workflowContinuation: boolean
  decisionHeavy: boolean
  claudeGuide: boolean
  complex: boolean
  lexiconGuided: boolean
  questionIntent: boolean
}

export type Hello2ccIntentProfile = {
  rawPrompt: string
  primaryIntent: Hello2ccIntentKind
  signals: Hello2ccIntentSignals
  envelope: PromptEnvelope
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
  profile: 'balanced' | 'strict'
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

export type FileEditFailure = {
  filePath: string
  errorType: string
  count: number
  lastError: string
  updatedAt: string
}

export type Hello2ccSessionState = {
  sessionId: string
  capabilities: CapabilitySnapshot
  lastIntent?: Hello2ccIntentProfile
  lastRouteGuidance?: string
  lastRouteGuidanceSignature?: string
  activeTeamName?: string
  activeWorktreePath?: string
  toolFailureCounts: Record<string, number>
  recentSuccesses: ToolMemoryRecord[]
  recentFailures: ToolMemoryRecord[]
  fileEditFailures: FileEditFailure[]
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

export type ExecutionPlaybook = {
  orderedSteps: string[]
  primaryTools: string[]
  avoidShortcuts: string[]
}

export type RecoveryPlaybook = {
  guards: Array<{ trigger: string; recipe: string }>
}

export type OutputContract = {
  openingStyle: string
  sectionOrder: string[]
  tableMode?: string
}

export type UniversalGuidance = {
  role: Hello2ccRole
  specialization: Hello2ccIntentKind
  decisionBackbone: string[]
  executionPlaybook: ExecutionPlaybook
  recoveryPlaybook: RecoveryPlaybook
  outputContract: OutputContract
  tieBreakers: string[]
}
