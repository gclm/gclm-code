import type { Hello2ccSessionState } from './types.js'

type RoutedSubagentType = 'Explore' | 'Plan'

function isSubagentAvailable(
  sessionState: Hello2ccSessionState,
  type: RoutedSubagentType,
): boolean {
  return sessionState.capabilities.availableSubagentTypes.includes(type)
}

export function suggestSubagentType(
  toolName: string,
  toolInput: Record<string, unknown>,
  sessionState: Hello2ccSessionState,
): {
  subagentType?: RoutedSubagentType
  note?: string
  shapingNotes: string[]
} {
  if (toolName !== 'Agent') {
    return { shapingNotes: [] }
  }

  const intent = sessionState.lastIntent
  if (!intent) {
    return { shapingNotes: [] }
  }

  const s = intent.signals
  const shapingNotes: string[] = []

  if (s.explore || s.research) {
    if (isSubagentAvailable(sessionState, 'Explore')) {
      return {
        subagentType: 'Explore',
        note: 'Intent signals exploration — use Explore subagent for scoped discovery',
        shapingNotes: ['Focus on finding relevant surfaces, not implementing'],
      }
    }
    shapingNotes.push(
      'Explore subagent is unavailable — keep the Agent prompt read-only and focused on investigation',
    )
    return { shapingNotes }
  }

  if (s.plan) {
    if (isSubagentAvailable(sessionState, 'Plan')) {
      return {
        subagentType: 'Plan',
        note: 'Intent signals planning — use Plan subagent to structure phases',
        shapingNotes: ['Identify constraints and executable phases before acting'],
      }
    }
    shapingNotes.push(
      'Plan subagent is unavailable — keep planning steps explicit in the Agent prompt',
    )
    return { shapingNotes }
  }

  if (s.review) {
    if (isSubagentAvailable(sessionState, 'Explore')) {
      return {
        subagentType: 'Explore',
        note: 'Review intent — use Explore subagent to inspect changes',
        shapingNotes: ['Read changed files, check diffs, identify findings by severity'],
      }
    }
    shapingNotes.push(
      'Explore subagent is unavailable — keep the Agent prompt read-only and focused on inspection',
    )
    return { shapingNotes }
  }

  if (s.boundedImplementation) {
    shapingNotes.push('Implementation is bounded — prefer direct Agent over Explore/Plan')
  }

  return { shapingNotes }
}
