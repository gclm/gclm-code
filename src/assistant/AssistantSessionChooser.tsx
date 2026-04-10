import React, { useState } from 'react'
import { Box, Text, useInput } from 'ink'
import figures from 'figures'

type AssistantSession = {
  id: string
  title?: string
  repo?: string
  status?: string
}

type Props = {
  sessions: AssistantSession[]
  onSelect: (sessionId: string) => void
  onCancel: () => void
}

export function AssistantSessionChooser({
  sessions,
  onSelect,
  onCancel,
}: Props) {
  const [selectedIndex, setSelectedIndex] = useState(0)

  useInput((input, key) => {
    if (input === 'escape' || input === 'q') {
      onCancel()
      return
    }

    if (key.downArrow) {
      setSelectedIndex(i => Math.min(i + 1, sessions.length - 1))
    } else if (key.upArrow) {
      setSelectedIndex(i => Math.max(i - 1, 0))
    } else if (input === '\r' || input === '\n') {
      onSelect(sessions[selectedIndex]?.id ?? null)
    }
  })

  return (
    <Box flexDirection="column" padding={1}>
      <Text bold>Select an assistant session to connect to:</Text>
      <Box flexDirection="column" marginTop={1}>
        {sessions.map((session, index) => (
          <Box key={session.id}>
            <Text>{index === selectedIndex ? `${figures.pointer} ` : '  '}</Text>
            <Text bold={index === selectedIndex}>
              {session.title || 'Untitled'}
            </Text>
            {session.repo && <Text dimColor> — {session.repo}</Text>}
            {session.status && (
              <Text dimColor> ({session.status})</Text>
            )}
          </Box>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text dimColor>
          Use {figures.arrowUp}/{figures.arrowDown} to navigate, Enter to select, Esc to cancel
        </Text>
      </Box>
    </Box>
  )
}
