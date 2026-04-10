import type { Command } from '../../commands.js'

const thinkback = {
  type: 'local-jsx',
  name: 'think-back',
  description: 'Your 2025 Gclm Code Year in Review',
  isEnabled: () =>
    false,
  load: () => import('./thinkback.js'),
} satisfies Command

export default thinkback
