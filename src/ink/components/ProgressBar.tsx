/**
 * ProgressBar component for long-running operation progress.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface ProgressBarProps {
  progress: number; // 0-100
  label?: string;
  width?: number;
  showPercentage?: boolean;
}

export function ProgressBar({
  progress,
  label = '',
  width = 40,
  showPercentage = true,
}: ProgressBarProps): React.ReactElement {
  const clampedProgress = Math.min(100, Math.max(0, progress));
  const filled = Math.floor((clampedProgress / 100) * width);
  const empty = width - filled;

  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const percentage = `${Math.round(clampedProgress)}%`;

  return (
    <Box flexDirection="column">
      {label && (
        <Box>
          <Text>{label}</Text>
        </Box>
      )}
      <Box>
        <Text color="cyan">{bar}</Text>
        {showPercentage && (
          <Text> {percentage}</Text>
        )}
      </Box>
    </Box>
  );
}

export default ProgressBar;