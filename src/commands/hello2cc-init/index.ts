import type { Command } from '../../commands.js'

const hello2ccInit = {
  type: 'local',
  name: 'hello2cc-init',
  aliases: ['hello2cc-config'],
  description:
    'Generate the recommended hello2cc config for the current project and write it to the conventional auto-load location',
  supportsNonInteractive: true,
  load: () => import('./hello2cc-init.js'),
} satisfies Command

export default hello2ccInit
