import type { Hello2ccSessionState } from './types.js'
import { getApplicableHello2ccStrategies } from './strategy.js'

type RoutedSubagentType = 'Explore' | 'Plan'

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

  const guidance = {
    subagentType: undefined as RoutedSubagentType | undefined,
    note: undefined as string | undefined,
    shapingNotes: [] as string[],
  }

  const { context, strategies } = getApplicableHello2ccStrategies(sessionState)

  for (const strategy of strategies) {
    const contribution = strategy.suggestSubagentGuidance?.({
      context,
      toolName,
      toolInput,
    })
    if (!contribution) {
      continue
    }
    if (!guidance.subagentType && contribution.subagentType) {
      guidance.subagentType = contribution.subagentType
      guidance.note = contribution.note
    }
    if (contribution.shapingNotes?.length) {
      guidance.shapingNotes.push(...contribution.shapingNotes)
    }
  }

  return guidance
}
