/**
 * Bridge Protocol Types
 *
 * Defines the WebSocket bridge protocol messages for VS Code integration.
 */

export enum BridgeMessageType {
  FILE_EVENT = 'file_event',
  TERMINAL_OUTPUT = 'terminal_output',
  AGENT_COMMAND = 'agent_command',
  SESSION_HANDOFF = 'session_handoff',
  CONNECT = 'connect',
  DISCONNECT = 'disconnect',
  AUTH_REQUEST = 'auth_request',
  AUTH_RESPONSE = 'auth_response',
  HEARTBEAT = 'heartbeat',
  ERROR = 'error',
}

/**
 * Base bridge message structure
 */
export interface BridgeMessage<T = unknown> {
  type: BridgeMessageType;
  payload: T;
  session_id: string;
  timestamp: string;
}

/**
 * File system event
 */
export interface FileEvent {
  type: 'changed' | 'created' | 'deleted';
  path: string;
  content: string;
}

/**
 * Terminal output with optional styling
 */
export interface TerminalOutput {
  lines: string[];
  style: string[];
}

/**
 * Agent command from VS Code
 */
export interface AgentCommand {
  action: 'start' | 'stop' | 'pause' | 'resume' | 'interrupt';
  command?: string; // For start action
  session_id?: string;
}

/**
 * Session handoff between terminal and VS Code
 */
export interface SessionHandoff {
  from: 'terminal' | 'vscode';
  to: 'terminal' | 'vscode';
  session_state: SessionState;
}

/**
 * Session state for handoff
 */
export interface SessionState {
  session_id: string;
  project_path: string;
  conversation_history: ConversationMessage[];
  context: SessionContext;
  preferences: SessionPreferences;
}

/**
 * Conversation message structure
 */
export interface ConversationMessage {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  timestamp: string;
}

/**
 * Session context
 */
export interface SessionContext {
  git_branch?: string;
  git_diff?: string;
  file_tree?: string[];
  memories?: string[];
}

/**
 * Session preferences
 */
export interface SessionPreferences {
  permission_mode: 'ask' | 'allow' | 'deny' | 'limited';
  context_window: number;
  autoDream_enabled: boolean;
}

/**
 * Authentication request
 */
export interface AuthRequest {
  device_code?: string;
  refresh_token?: string;
  jwt_token?: string;
}

/**
 * Authentication response
 */
export interface AuthResponse {
  success: boolean;
  jwt_token?: string;
  refresh_token?: string;
  expires_in?: number; // seconds
  error?: string;
}

/**
 * Heartbeat message
 */
export interface Heartbeat {
  client_id: string;
  last_activity: string;
}

/**
 * Error message
 */
export interface BridgeError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

/**
 * Connection info
 */
export interface ConnectionInfo {
  client_id: string;
  client_type: 'vscode' | 'terminal' | 'remote';
  capabilities: string[];
  version: string;
}

/**
 * Create a bridge message
 */
export function createBridgeMessage<T>(
  type: BridgeMessageType,
  payload: T,
  sessionId: string,
): BridgeMessage<T> {
  return {
    type,
    payload,
    session_id: sessionId,
    timestamp: new Date().toISOString(),
  };
}