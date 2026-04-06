import { mkdir, writeFile } from 'fs/promises'
import { dirname } from 'path'
import type { LocalCommandCall } from '../../types/command.js'
import { getOriginalCwd } from '../../bootstrap/state.js'
import { jsonStringify } from '../../utils/slowOperations.js'
import {
  buildRecommendedHello2ccProjectSettings,
  getHello2ccProjectPresetPath,
  getHello2ccUserPresetPath,
} from '../../utils/settings/settings.js'
import { resetSettingsCache } from '../../utils/settings/settingsCache.js'

function usage(): string {
  return [
    'Usage: /hello2cc-init [user|project|both|print|paths]',
    '',
    '  user    Write the current project preset to ~/.claude/hello2cc/<project>.json (default)',
    '  project Write the current project preset to .claude/hello2cc.json',
    '  both    Write both files',
    '  print   Print the generated JSON without writing files',
    '  paths   Show the resolved conventional file paths',
  ].join('\n')
}

export const call: LocalCommandCall = async args => {
  const mode = (args.trim() || 'user').toLowerCase()
  const cwd = getOriginalCwd()
  const settings = buildRecommendedHello2ccProjectSettings(cwd)
  const rendered = jsonStringify(settings, null, 2) + '\n'
  const userPath = getHello2ccUserPresetPath(cwd)
  const projectPath = getHello2ccProjectPresetPath(cwd)

  if (mode === 'help' || mode === '--help' || mode === '-h') {
    return { type: 'text', value: usage() }
  }

  if (mode === 'print') {
    return { type: 'text', value: rendered.trimEnd() }
  }

  if (mode === 'paths') {
    return {
      type: 'text',
      value: [
        `Current project: ${cwd}`,
        `User preset path: ${userPath}`,
        `Project preset path: ${projectPath}`,
      ].join('\n'),
    }
  }

  const targets =
    mode === 'both'
      ? [userPath, projectPath]
      : mode === 'project'
        ? [projectPath]
        : mode === 'user'
          ? [userPath]
          : null

  if (!targets) {
    return { type: 'text', value: usage() }
  }

  for (const filePath of targets) {
    await mkdir(dirname(filePath), { recursive: true })
    await writeFile(filePath, rendered, { encoding: 'utf8', mode: 0o600 })
  }

  resetSettingsCache()

  return {
    type: 'text',
    value: [
      `Generated hello2cc config for ${cwd}`,
      ...targets.map(target => `- ${target}`),
      '',
      'These conventional hello2cc files are auto-loaded, so you do not need to copy the same block into settings.json unless you want an explicit override there.',
    ].join('\n'),
  }
}
