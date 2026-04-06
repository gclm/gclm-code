import React from 'react'
import { Box, Text } from 'src/ink.js'

import { Clawd } from './Clawd.js'

const WELCOME_V2_WIDTH = 58

/**
 * Onboarding and setup-token should use the same brand mark as the main logo
 * surfaces so the product identity stays visually consistent.
 */
export function WelcomeV2(): React.ReactNode {
  return (
    <Box
      width={WELCOME_V2_WIDTH}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
    >
      <Text>
        <Text color="startupAccent">Welcome to Gclm Code</Text>{' '}
        <Text dimColor>v{MACRO.VERSION}</Text>
      </Text>

      <Box marginY={1}>
        <Clawd />
      </Box>
    </Box>
  )
}
