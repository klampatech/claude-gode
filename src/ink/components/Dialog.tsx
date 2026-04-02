/**
 * Dialog component for confirmations and inputs.
 */

import React, { useState } from 'react';
import { Box, Text } from 'ink';
import { useInput } from 'ink';

export interface DialogProps {
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function Dialog({
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'OK',
  cancelLabel = 'Cancel',
}: DialogProps): React.ReactElement {
  const [selected, setSelected] = useState<'confirm' | 'cancel'>('confirm');

  useInput((_input, key) => {
    if (key.leftArrow || key.rightArrow || key.tab) {
      setSelected((prev) => (prev === 'confirm' ? 'cancel' : 'confirm'));
    } else if (key.return) {
      if (selected === 'confirm') {
        onConfirm();
      } else {
        onCancel();
      }
    } else if (key.escape) {
      onCancel();
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="yellow" padding={1}>
      <Box>
        <Text bold color="yellow">
          {title}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text>{message}</Text>
      </Box>
      <Box marginTop={1} gap={2}>
        <Text
          bold={selected === 'confirm'}
          color={selected === 'confirm' ? 'green' : 'gray'}
        >
          [{selected === 'confirm' ? 'x' : ' '}] {confirmLabel}
        </Text>
        <Text
          bold={selected === 'cancel'}
          color={selected === 'cancel' ? 'green' : 'gray'}
        >
          [{selected === 'cancel' ? 'x' : ' '}] {cancelLabel}
        </Text>
      </Box>
      <Box marginTop={1}>
        <Text dimColor>Press Enter to confirm, Escape to cancel</Text>
      </Box>
    </Box>
  );
}

export default Dialog;