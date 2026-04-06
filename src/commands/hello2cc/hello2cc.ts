import type { LocalCommandCall } from '../../types/command.js'
import { getGatewayOrchestrationState } from '../../orchestration/hello2cc/index.js'
import { buildHello2ccDebugDump } from '../../orchestration/hello2cc/observability.js'

export const call: LocalCommandCall = async () => {
  const state = getGatewayOrchestrationState()
  if (!state) {
    return {
      type: 'text',
      value:
        'hello2cc orchestration is not active for this session yet. Run a normal prompt or /status first, then try /hello2cc again.',
    }
  }

  return {
    type: 'text',
    value: buildHello2ccDebugDump(state),
  }
}
