/**
 * Message component for user/assistant message display.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface MessageProps {
  message: {
    id: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
  };
}

export function Message({ message }: MessageProps): React.ReactElement {
  const roleColor = {
    user: 'blue',
    assistant: 'green',
    system: 'yellow',
  }[message.role];

  const roleLabel = {
    user: 'You',
    assistant: 'Claude',
    system: 'System',
  }[message.role];

  return (
    <Box flexDirection="column" marginY={1}>
      <Box>
        <Text bold color={roleColor}>
          {roleLabel}:
        </Text>
      </Box>
      <Box paddingLeft={2}>
        <Text>{message.content}</Text>
      </Box>
      {message.timestamp && (
        <Box>
          <Text dimColor>
            {new Date(message.timestamp).toLocaleTimeString()}
          </Text>
        </Box>
      )}
    </Box>
  );
}