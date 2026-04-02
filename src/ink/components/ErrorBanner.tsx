/**
 * ErrorBanner component for error message display.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface ErrorBannerProps {
  message: string;
  type?: 'error' | 'warning' | 'info';
  onDismiss?: () => void;
}

export function ErrorBanner({ message, type = 'error', onDismiss }: ErrorBannerProps): React.ReactElement {
  const colorMap = {
    error: 'red',
    warning: 'yellow',
    info: 'blue',
  };

  const iconMap = {
    error: '✖',
    warning: '⚠',
    info: 'ℹ',
  };

  const color = colorMap[type];
  const icon = iconMap[type];

  // Wrap long messages
  const maxWidth = 80;
  const lines: string[] = [];
  const words = message.split(' ');
  let currentLine = '';

  for (const word of words) {
    if ((currentLine + ' ' + word).length > maxWidth) {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = currentLine ? currentLine + ' ' + word : word;
    }
  }
  if (currentLine) lines.push(currentLine);

  return (
    <Box flexDirection="column" borderStyle="bold" borderColor={color} padding={1} marginY={1}>
      <Box>
        <Text bold color={color}>
          {icon} {type.toUpperCase()}
        </Text>
      </Box>
      {lines.map((line, i) => (
        <Box key={i}>
          <Text color={color}>{line}</Text>
        </Box>
      ))}
      {onDismiss && (
        <Box marginTop={1}>
          <Text dimColor>Press any key to dismiss</Text>
        </Box>
      )}
    </Box>
  );
}

export default ErrorBanner;