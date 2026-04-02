/**
 * MorePrompt component for paginated output.
 */

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useInput } from 'ink';

export interface MorePromptProps {
  totalItems: number;
  visibleItems: number;
  onContinue: () => void;
  onExit: () => void;
}

export function MorePrompt({ totalItems, visibleItems, onContinue, onExit }: MorePromptProps): React.ReactElement {
  const [selected, setSelected] = useState<'more' | 'quit'>('more');

  useInput((input, key) => {
    if (key.leftArrow || key.rightArrow) {
      setSelected((prev) => (prev === 'more' ? 'quit' : 'more'));
    } else if (key.return) {
      if (selected === 'more') {
        onContinue();
      } else {
        onExit();
      }
    } else if (input === ' ') {
      onContinue();
    } else if (input === 'q') {
      onExit();
    }
  });

  const remaining = totalItems - visibleItems;

  return (
    <Box borderStyle="round" borderColor="dim" paddingX={2} paddingY={1}>
      <Text dimColor>
        ─── More ({remaining} items) ───
      </Text>
      <Box marginLeft={2}>
        <Text
          bold={selected === 'more'}
          color={selected === 'more' ? 'green' : 'dim'}
        >
          [More]
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text
          bold={selected === 'quit'}
          color={selected === 'quit' ? 'green' : 'dim'}
        >
          [Quit]
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text dimColor>Space/q/Enter</Text>
      </Box>
    </Box>
  );
}

export default MorePrompt;