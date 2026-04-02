/**
 * BuddyDisplay - ASCII companion sprite component.
 */

import React from 'react';
import { Box, Text } from 'ink';

export type BuddyState = 'idle' | 'happy' | 'sad' | 'working';

export interface BuddyDisplayProps {
  state?: BuddyState;
  name?: string;
}

const BUDDY_FRAMES: Record<BuddyState, string[]> = {
  idle: [
    '    ┌───┐',
    '    │ • │',
    '    ╰───╯',
    '   👋      ',
  ],
  happy: [
    '    ┌───┐',
    '    │ ^ │',
    '    ╰───╯',
    '   🎉      ',
  ],
  sad: [
    '    ┌───┐',
    '    │ • │',
    '    ╰───╯',
    '   💭      ',
  ],
  working: [
    '    ┌───┐',
    '    │ o │',
    '    ╰───╯',
    '   ⌨️      ',
  ],
};

export function BuddyDisplay({ state = 'idle', name = 'Claude' }: BuddyDisplayProps): React.ReactElement {
  const frames = BUDDY_FRAMES[state];
  const stateLabel = {
    idle: 'Ready',
    happy: 'Happy',
    sad: 'Thinking',
    working: 'Working',
  }[state];

  return (
    <Box flexDirection="column">
      {frames.map((line, i) => (
        <Text key={i} dimColor>
          {line}
        </Text>
      ))}
      <Box>
        <Text bold color="cyan">
          {name}: {stateLabel}
        </Text>
      </Box>
    </Box>
  );
}

export default BuddyDisplay;