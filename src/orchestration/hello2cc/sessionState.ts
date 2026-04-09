import { AGENT_TOOL_NAME } from '../../tools/AgentTool/constants.js'
import { ENTER_WORKTREE_TOOL_NAME } from '../../tools/EnterWorktreeTool/constants.js'
import { SEND_MESSAGE_TOOL_NAME } from '../../tools/SendMessageTool/constants.js'
import { TEAM_CREATE_TOOL_NAME } from '../../tools/TeamCreateTool/constants.js'
import { isAgentSwarmsEnabled } from '../../utils/agentSwarmsEnabled.js'
import { isWorktreeModeEnabled } from '../../utils/worktreeModeEnabled.js'
import type {
  CapabilitySnapshot,
  Hello2ccIntentProfile,
  PersistedHello2ccSessionState,
  Hello2ccSessionState,
  ToolMemoryRecord,
} from './types.js'
import { recordFileEditFailure } from './fileEditProtection.js'

const MAX_MEMORY_RECORDS = 5
const sessionStateStore = new Map<string, Hello2ccSessionState>()

function buildToolNames(): string[] {
  const toolNames = [AGENT_TOOL_NAME, SEND_MESSAGE_TOOL_NAME]
  if (isAgentSwarmsEnabled()) {
    toolNames.push(TEAM_CREATE_TOOL_NAME)
  }
  if (isWorktreeModeEnabled()) {
    toolNames.push(ENTER_WORKTREE_TOOL_NAME)
  }
  return toolNames
}

export function buildCapabilitySnapshot({
  cwd,
  agentType,
  model,
  availableSubagentTypes,
  mcpConnectedCount,
  mcpPendingCount,
  mcpNeedsAuthCount,
  mcpFailedCount,
  toolSearchOptimistic,
  webSearchAvailable,
  webSearchRequests,
  provider,
  strategyProfile,
}: {
  cwd: string
  agentType?: string
  model?: string
  availableSubagentTypes?: string[]
  mcpConnectedCount?: number
  mcpPendingCount?: number
  mcpNeedsAuthCount?: number
  mcpFailedCount?: number
  toolSearchOptimistic?: boolean
  webSearchAvailable?: boolean
  webSearchRequests?: number
  provider?: string
  strategyProfile?: 'balanced' | 'strict'
}): CapabilitySnapshot {
  const toolNames = buildToolNames()
  return {
    cwd,
    toolNames,
    supportsAgent: true,
    supportsTeam: toolNames.includes(TEAM_CREATE_TOOL_NAME),
    supportsMessaging: toolNames.includes(SEND_MESSAGE_TOOL_NAME),
    supportsWorktree: toolNames.includes(ENTER_WORKTREE_TOOL_NAME),
    availableSubagentTypes: availableSubagentTypes ?? [],
    mcpConnectedCount: mcpConnectedCount ?? 0,
    mcpPendingCount: mcpPendingCount ?? 0,
    mcpNeedsAuthCount: mcpNeedsAuthCount ?? 0,
    mcpFailedCount: mcpFailedCount ?? 0,
    toolSearchOptimistic: toolSearchOptimistic ?? false,
    webSearchAvailable: webSearchAvailable ?? false,
    webSearchRequests: webSearchRequests ?? 0,
    provider,
    profile: strategyProfile ?? 'balanced',
    agentType,
    model,
  }
}

function mergeCapabilities(
  previous: CapabilitySnapshot | undefined,
  next: CapabilitySnapshot,
): CapabilitySnapshot {
  return {
    ...previous,
    ...next,
    toolNames: next.toolNames,
  }
}

export function ensureHello2ccSessionState({
  sessionId,
  cwd,
  agentType,
  model,
  availableSubagentTypes,
  mcpConnectedCount,
  mcpPendingCount,
  mcpNeedsAuthCount,
  mcpFailedCount,
  toolSearchOptimistic,
  webSearchAvailable,
  webSearchRequests,
  provider,
  strategyProfile,
}: {
  sessionId: string
  cwd: string
  agentType?: string
  model?: string
  availableSubagentTypes?: string[]
  mcpConnectedCount?: number
  mcpPendingCount?: number
  mcpNeedsAuthCount?: number
  mcpFailedCount?: number
  toolSearchOptimistic?: boolean
  webSearchAvailable?: boolean
  webSearchRequests?: number
  provider?: string
  strategyProfile?: 'balanced' | 'strict'
}): Hello2ccSessionState {
  const existing = sessionStateStore.get(sessionId)
  const capabilities = mergeCapabilities(
    existing?.capabilities,
    buildCapabilitySnapshot({
      cwd,
      agentType,
      model,
      availableSubagentTypes,
      mcpConnectedCount,
      mcpPendingCount,
      mcpNeedsAuthCount,
      mcpFailedCount,
      toolSearchOptimistic,
      webSearchAvailable,
      webSearchRequests,
      provider,
      strategyProfile,
    }),
  )

  const nextState: Hello2ccSessionState = existing
    ? { ...existing, capabilities }
    : {
        sessionId,
        capabilities,
        toolFailureCounts: {},
        recentSuccesses: [],
        recentFailures: [],
        fileEditFailures: [],
      }

  sessionStateStore.set(sessionId, nextState)
  return nextState
}

export function getHello2ccSessionState(
  sessionId: string,
): Hello2ccSessionState | undefined {
  return sessionStateStore.get(sessionId)
}

export function updateHello2ccSessionState(
  sessionId: string,
  updater: (state: Hello2ccSessionState) => Hello2ccSessionState,
): Hello2ccSessionState {
  const current =
    sessionStateStore.get(sessionId) ??
    ensureHello2ccSessionState({ sessionId, cwd: process.cwd() })
  const next = updater(current)
  sessionStateStore.set(sessionId, next)
  return next
}

export function rememberIntentProfile(
  sessionId: string,
  intentProfile: Hello2ccIntentProfile,
): Hello2ccSessionState | undefined {
  const current = sessionStateStore.get(sessionId)
  if (!current) return undefined
  const next = { ...current, lastIntent: intentProfile }
  sessionStateStore.set(sessionId, next)
  return next
}

export function rememberRouteGuidance(
  sessionId: string,
  routeGuidance: string,
  signature?: string,
): Hello2ccSessionState | undefined {
  const current = sessionStateStore.get(sessionId)
  if (!current) return undefined
  const next = { ...current, lastRouteGuidance: routeGuidance, lastRouteGuidanceSignature: signature }
  sessionStateStore.set(sessionId, next)
  return next
}

function createToolSignature(
  toolName: string,
  detail: Record<string, unknown> | string,
): string {
  const payload = typeof detail === 'string' ? detail : JSON.stringify(detail)
  return `${toolName}:${payload}`
}

function upsertMemoryRecord(
  records: ToolMemoryRecord[],
  toolName: string,
  detail: Record<string, unknown> | string,
  summary: string,
): ToolMemoryRecord[] {
  const signature = createToolSignature(toolName, detail)
  const existing = records.find(record => record.signature === signature)
  const updatedAt = new Date().toISOString()

  if (existing) {
    return records
      .map(record =>
        record.signature === signature
          ? { ...record, summary, updatedAt, count: record.count + 1 }
          : record,
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  return [
    { toolName, signature, summary, count: 1, updatedAt },
    ...records,
  ].slice(0, MAX_MEMORY_RECORDS)
}

export function rememberToolSuccess(
  sessionId: string,
  toolName: string,
  detail: Record<string, unknown>,
  summary: string,
): Hello2ccSessionState | undefined {
  const current = sessionStateStore.get(sessionId)
  if (!current) return undefined
  const next = {
    ...current,
    toolFailureCounts: { ...current.toolFailureCounts, [toolName]: 0 },
    recentSuccesses: upsertMemoryRecord(current.recentSuccesses, toolName, detail, summary),
  }
  sessionStateStore.set(sessionId, next)
  return next
}

export function rememberToolFailure(
  sessionId: string,
  toolName: string,
  detail: Record<string, unknown>,
  summary: string,
): Hello2ccSessionState | undefined {
  const current = sessionStateStore.get(sessionId)
  if (!current) return undefined

  // Track file edit failures
  const nextState = recordFileEditFailure(current, toolName, detail, summary)
  const stateToUpdate = nextState ?? current

  const updated = {
    ...stateToUpdate,
    toolFailureCounts: {
      ...stateToUpdate.toolFailureCounts,
      [toolName]: (stateToUpdate.toolFailureCounts[toolName] ?? 0) + 1,
    },
    recentFailures: upsertMemoryRecord(stateToUpdate.recentFailures, toolName, detail, summary),
  }
  sessionStateStore.set(sessionId, updated)
  return updated
}

export function clearHello2ccSessionState(sessionId: string): void {
  sessionStateStore.delete(sessionId)
}

export function snapshotHello2ccSessionState(
  state: Hello2ccSessionState,
): PersistedHello2ccSessionState {
  return {
    ...state,
    capabilities: { ...state.capabilities, toolNames: [...state.capabilities.toolNames] },
    toolFailureCounts: { ...state.toolFailureCounts },
    recentSuccesses: (state.recentSuccesses ?? []).map(r => ({ ...r })),
    recentFailures: (state.recentFailures ?? []).map(r => ({ ...r })),
    fileEditFailures: (state.fileEditFailures ?? []).map(f => ({ ...f })),
  }
}

export function restoreHello2ccSessionState(
  state: PersistedHello2ccSessionState | undefined,
): Hello2ccSessionState | undefined {
  if (!state) return undefined
  const restored = snapshotHello2ccSessionState(state)
  sessionStateStore.set(restored.sessionId, restored)
  return restored
}
