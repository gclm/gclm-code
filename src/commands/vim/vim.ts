import {
  type SafeEventValue,
  logEvent,
} from '../../services/analytics/index.js'
import type { LocalCommandCall } from '../../types/command.js'
import { getGlobalConfig, saveGlobalConfig } from '../../utils/config.js'

export const call: LocalCommandCall = async () => {
  const config = getGlobalConfig()
  let currentMode = config.editorMode || 'normal'

  // Handle backward compatibility - treat 'emacs' as 'normal'
  if (currentMode === 'emacs') {
    currentMode = 'normal'
  }

  const newMode = currentMode === 'normal' ? 'vim' : 'normal'

  saveGlobalConfig(current => ({
    ...current,
    editorMode: newMode,
  }))

  logEvent('tengu_editor_mode_changed', {
    mode: newMode as SafeEventValue,
    source:
      'command' as SafeEventValue,
  })

  return {
    type: 'text',
    value: `Editor mode set to ${newMode}. ${
      newMode === 'vim'
        ? 'Use Escape key to toggle between INSERT and NORMAL modes.'
        : 'Using standard (readline) keyboard bindings.'
    }`,
  }
}
