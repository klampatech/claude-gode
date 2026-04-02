/**
 * Main App component for Ink terminal UI.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import { Message } from './components/Message.js';
import { Spinner } from './components/Spinner.js';
import { Dialog } from './components/Dialog.js';
import { CodeBlock } from './components/CodeBlock.js';
import { ErrorBanner } from './components/ErrorBanner.js';
import { BuddyDisplay } from './components/BuddyDisplay.js';

export interface MessageData {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp?: string;
}

export interface AppState {
  messages: MessageData[];
  isLoading: boolean;
  error: string | null;
  buddyState: 'idle' | 'happy' | 'sad' | 'working';
}

export function App(): React.ReactElement {
  const [state, setState] = useState<AppState>({
    messages: [],
    isLoading: false,
    error: null,
    buddyState: 'idle',
  });

  // Add message to the chat
  const addMessage = (message: Omit<MessageData, 'id' | 'timestamp'>) => {
    const newMessage: MessageData = {
      ...message,
      id: `msg-${Date.now()}`,
      timestamp: new Date().toISOString(),
    };
    setState((prev) => ({
      ...prev,
      messages: [...prev.messages, newMessage],
    }));
  };

  // Clear all messages
  const clearMessages = () => {
    setState((prev) => ({ ...prev, messages: [] }));
  };

  // Set loading state
  const setLoading = (loading: boolean) => {
    setState((prev) => ({
      ...prev,
      isLoading: loading,
      buddyState: loading ? 'working' : 'idle',
    }));
  };

  // Set error
  const setError = (error: string | null) => {
    setState((prev) => ({
      ...prev,
      error,
      buddyState: error ? 'sad' : 'idle',
    }));
  };

  return (
    <Box flexDirection="column" minHeight={0}>
      {/* Header */}
      <Box borderStyle="round" borderColor="cyan" padding={1}>
        <Text bold color="cyan">
          Claude Code
        </Text>
      </Box>

      {/* Error Banner */}
      {state.error && (
        <ErrorBanner
          message={state.error}
          onDismiss={() => setError(null)}
        />
      )}

      {/* Messages */}
      <Box flexDirection="column" flexGrow={1}>
        {state.messages.map((msg) => (
          <Message key={msg.id} message={msg} />
        ))}
      </Box>

      {/* Loading State */}
      {state.isLoading && (
        <Box>
          <Spinner label="Thinking..." />
        </Box>
      )}

      {/* Buddy Display */}
      <Box marginTop={1}>
        <BuddyDisplay state={state.buddyState} />
      </Box>
    </Box>
  );
}