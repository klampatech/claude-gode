/**
 * Spinner component with 60fps animation.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';

export interface SpinnerProps {
  label?: string;
  color?: string;
  forceComplete?: boolean;
}

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const COMPLETE_FRAMES = ['✓', '✓', '✓'];

export function Spinner({ label = '', color = 'cyan', forceComplete = false }: SpinnerProps): React.ReactElement {
  const [frameIndex, setFrameIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    if (forceComplete) {
      setIsComplete(true);
      return;
    }

    const interval = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % FRAMES.length);
    }, 50); // 20fps for character animation (60fps would be too fast for terminal)

    return () => clearInterval(interval);
  }, [forceComplete]);

  const frames = isComplete ? COMPLETE_FRAMES : FRAMES;
  const frame = frames[frameIndex % frames.length];

  return (
    <Box alignSelf="flex-start">
      <Text color={color}>{frame}</Text>
      {label && <Text> {label}</Text>}
      {isComplete && (
        <Text color="green"> Done</Text>
      )}
    </Box>
  );
}

export default Spinner;