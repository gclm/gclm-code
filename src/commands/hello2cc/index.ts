import type { Command } from '../../commands.js'

const hello2cc = {
  type: 'local',
  name: 'hello2cc',
  aliases: ['hello2cc-debug'],
  description: 'Show the current hello2cc orchestration debug snapshot for this session',
  supportsNonInteractive: true,
  load: () => import('./hello2cc.js'),
} satisfies Command

export default hello2cc
