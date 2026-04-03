import * as React from 'react'
import { Box, Text } from '../../ink.js'
import { env } from '../../utils/env.js'

export type ClawdPose =
  | 'default'
  | 'arms-up'
  | 'look-left'
  | 'look-right'

type Props = {
  pose?: ClawdPose
}

type Segments = {
  r1L: string
  r1E: string
  r1R: string
  r2L: string
  r2R: string
}

const POSES: Record<ClawdPose, Segments> = {
  default: {
    r1L: ' ▐',
    r1E: '▛▞█▚▜',
    r1R: '▌',
    r2L: '▝▙',
    r2R: '▟▘',
  },
  'look-left': {
    r1L: ' ▐',
    r1E: '▟▞█▚▟',
    r1R: '▌',
    r2L: '▝▙',
    r2R: '▟▘',
  },
  'look-right': {
    r1L: ' ▐',
    r1E: '▙▞█▚▙',
    r1R: '▌',
    r2L: '▝▙',
    r2R: '▟▘',
  },
  'arms-up': {
    r1L: '▗▛',
    r1E: '▛▞█▚▜',
    r1R: '▜▖',
    r2L: ' ▙',
    r2R: '▟ ',
  },
}

const APPLE_EYES: Record<ClawdPose, string> = {
  default: ' ▗ ▘ ▖ ',
  'look-left': ' ▘ ▘ ▘ ',
  'look-right': ' ▝ ▝ ▝ ',
  'arms-up': ' ▗ ▘ ▖ ',
}

export function Clawd({ pose = 'default' }: Props = {}): React.ReactNode {
  if (env.terminal === 'Apple_Terminal') {
    return <AppleTerminalClawd pose={pose} />
  }

  const p = POSES[pose]

  return (
    <Box flexDirection="column">
      <Text>
        <Text color="clawd_body">{p.r1L}</Text>
        <Text color="clawd_body" backgroundColor="clawd_background">
          {p.r1E}
        </Text>
        <Text color="clawd_body">{p.r1R}</Text>
      </Text>
      <Text>
        <Text color="clawd_body">{p.r2L}</Text>
        <Text color="clawd_body" backgroundColor="clawd_background">
          ▆▆▆▆▆
        </Text>
        <Text color="clawd_body">{p.r2R}</Text>
      </Text>
      <Text color="clawd_body">{'  '}▘▔ ▔▝{'  '}</Text>
    </Box>
  )
}

function AppleTerminalClawd({ pose }: { pose: ClawdPose }): React.ReactNode {
  return (
    <Box flexDirection="column" alignItems="center">
      <Text>
        <Text color="clawd_body">▗</Text>
        <Text color="clawd_background" backgroundColor="clawd_body">
          {APPLE_EYES[pose]}
        </Text>
        <Text color="clawd_body">▖</Text>
      </Text>
      <Text backgroundColor="clawd_body">{' '.repeat(7)}</Text>
      <Text color="clawd_body">▘▔ ▔▝</Text>
    </Box>
  )
}
