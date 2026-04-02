/**
 * Ink React CLI renderer entry point.
 * Sets up the React/Ink rendering tree for terminal UI.
 */

import React from 'react';
import { render } from 'ink';
import { App } from './App.js';

export { App } from './App.js';
export { Message } from './components/Message.js';
export { Spinner } from './components/Spinner.js';
export { Dialog } from './components/Dialog.js';
export { CodeBlock } from './components/CodeBlock.js';
export { Table } from './components/Table.js';
export { ProgressBar } from './components/ProgressBar.js';
export { ErrorBanner } from './components/ErrorBanner.js';
export { BuddyDisplay } from './components/BuddyDisplay.js';
export { MorePrompt } from './components/MorePrompt.js';

export function renderApp(): void {
  render(React.createElement(App));
}