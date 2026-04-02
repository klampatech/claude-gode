/**
 * IDE Bridge Integration - VS Code WebSocket bridge, remote sessions, OAuth flow,
 * output mirroring, file system event synchronization, and session handoff.
 *
 * This module provides the bridge protocol for connecting Claude Code with VS Code,
 * enabling remote sessions, trusted device authentication, and seamless handoff
 * between terminal and IDE.
 */

export { VsCodeBridge, type VsCodeBridgeConfig } from './VsCodeBridge';
export { RemoteSession, type RemoteSessionConfig, RemoteConnectionState } from './RemoteSession';
export { OAuthFlow, type OAuthConfig, OAuthState, type OAuthTokens } from './OAuthFlow';
export type {
  BridgeMessage,
  FileEvent,
  TerminalOutput,
  SessionHandoff,
  BridgeMessageType,
} from './Protocol';
export { FileSync } from './FileSync';
export { SessionHandoffManager } from './SessionHandoff';
export { BridgeServer } from './BridgeServer';