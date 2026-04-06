import type { LocalCommandCall } from '../../types/command.js'
import { getGatewayOrchestrationState } from '../../orchestration/hello2cc/index.js'
import {
  buildHello2ccDebugDump,
  buildHello2ccDiagnosticSummary,
} from '../../orchestration/hello2cc/observability.js'

function usage(): string {
  return [
    'Usage: /hello2cc [summary|json|both]',
    '',
    '  summary  Show a human-friendly diagnostic summary (default)',
    '  json     Show the raw JSON snapshot for AI-assisted diagnosis',
    '  both     Show the summary first, then the raw JSON snapshot',
  ].join('\n')
}

export const call: LocalCommandCall = async args => {
  const state = getGatewayOrchestrationState()
  if (!state) {
    return {
      type: 'text',
      value:
        'hello2cc orchestration is not active for this session yet. Run a normal prompt or /status first, then try /hello2cc again.',
    }
  }

  const mode = (args.trim() || 'summary').toLowerCase()
  if (['help', '--help', '-h'].includes(mode)) {
    return {
      type: 'text',
      value: usage(),
    }
  }

  const summary = buildHello2ccDiagnosticSummary(state)
  const json = buildHello2ccDebugDump(state)

  return {
    type: 'text',
    value:
      mode === 'json'
        ? json
        : mode === 'both'
          ? `${summary}\n\nRaw JSON snapshot\n${json}`
          : summary,
  }
}
