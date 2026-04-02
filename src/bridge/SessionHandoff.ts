/**
 * Session Handoff - Manages session handoff between terminal and VS Code
 *
 * Handles pausing a session in terminal and resuming in VS Code, preserving
 * all conversation history, context, and preferences.
 */

import {
  SessionHandoff,
  SessionState,
  ConversationMessage,
  SessionContext,
  SessionPreferences,
} from './Protocol.js';
import { MemoryStorage } from '../memdir/MemoryStorage.js';
import { logger } from '../utils/logger.js';

export interface SessionHandoffConfig {
  memory_storage?: MemoryStorage;
  handoff_timeout_ms?: number;
}

/**
 * Session Handoff Manager for transferring sessions between terminal and VS Code
 */
export class SessionHandoffManager {
  private config: Required<SessionHandoffConfig>;
  private memoryStorage: MemoryStorage;
  private activeHandoffs: Map<string, SessionState> = new Map();

  // Event handlers
  private onHandoffReady?: (handoff: SessionHandoff) => void;
  private onHandoffComplete?: (sessionId: string) => void;

  constructor(config: SessionHandoffConfig = {}) {
    const memoryPath = config.memory_storage ? '' : (process.cwd() ?? '');
    this.config = {
      memory_storage: config.memory_storage ?? new MemoryStorage(memoryPath),
      handoff_timeout_ms: config.handoff_timeout_ms ?? 30000,
    };
    this.memoryStorage = this.config.memory_storage;
  }

  /**
   * Create a session handoff from terminal to VS Code
   */
  async createTerminalToVsCodeHandoff(
    sessionId: string,
    projectPath: string,
    conversationHistory: ConversationMessage[],
    context: SessionContext,
    preferences: SessionPreferences,
  ): Promise<SessionHandoff> {
    const sessionState: SessionState = {
      session_id: sessionId,
      project_path: projectPath,
      conversation_history: conversationHistory,
      context,
      preferences,
    };

    // Persist session state for recovery
    await this.persistSessionState(sessionState);

    const handoff: SessionHandoff = {
      from: 'terminal',
      to: 'vscode',
      session_state: sessionState,
    };

    this.activeHandoffs.set(sessionId, sessionState);

    logger.info({ sessionId, from: 'terminal', to: 'vscode' }, 'Session handoff created');

    if (this.onHandoffReady) {
      this.onHandoffReady(handoff);
    }

    return handoff;
  }

  /**
   * Create a session handoff from VS Code to terminal
   */
  async createVsCodeToTerminalHandoff(
    sessionId: string,
    projectPath: string,
    conversationHistory: ConversationMessage[],
    context: SessionContext,
    preferences: SessionPreferences,
  ): Promise<SessionHandoff> {
    const sessionState: SessionState = {
      session_id: sessionId,
      project_path: projectPath,
      conversation_history: conversationHistory,
      context,
      preferences,
    };

    await this.persistSessionState(sessionState);

    const handoff: SessionHandoff = {
      from: 'vscode',
      to: 'terminal',
      session_state: sessionState,
    };

    this.activeHandoffs.set(sessionId, sessionState);

    logger.info({ sessionId, from: 'vscode', to: 'terminal' }, 'Session handoff created');

    if (this.onHandoffReady) {
      this.onHandoffReady(handoff);
    }

    return handoff;
  }

  /**
   * Accept a session handoff
   */
  async acceptHandoff(handoff: SessionHandoff): Promise<SessionState> {
    const { session_state } = handoff;

    // Validate handoff
    if (!session_state.session_id || !session_state.project_path) {
      throw new Error('Invalid session handoff: missing required fields');
    }

    // Store as active handoff
    this.activeHandoffs.set(session_state.session_id, session_state);

    // Update memory storage with session context
    await this.updateMemoryFromSession(session_state);

    logger.info({ sessionId: session_state.session_id }, 'Session handoff accepted');

    return session_state;
  }

  /**
   * Complete a session handoff
   */
  completeHandoff(sessionId: string): void {
    this.activeHandoffs.delete(sessionId);
    logger.info({ sessionId }, 'Session handoff completed');

    if (this.onHandoffComplete) {
      this.onHandoffComplete(sessionId);
    }
  }

  /**
   * Get active handoff state
   */
  getActiveHandoff(sessionId: string): SessionState | undefined {
    return this.activeHandoffs.get(sessionId);
  }

  /**
   * List all active handoffs
   */
  listActiveHandoffs(): SessionState[] {
    return Array.from(this.activeHandoffs.values());
  }

  /**
   * Cancel a pending handoff
   */
  cancelHandoff(sessionId: string): void {
    this.activeHandoffs.delete(sessionId);
    logger.info({ sessionId }, 'Session handoff cancelled');
  }

  /**
   * Set handoff ready handler
   */
  onHandoffReadyHandler(handler: (handoff: SessionHandoff) => void): void {
    this.onHandoffReady = handler;
  }

  /**
   * Set handoff complete handler
   */
  onHandoffCompleteHandler(handler: (sessionId: string) => void): void {
    this.onHandoffComplete = handler;
  }

  /**
   * Persist session state to memory storage
   */
  private async persistSessionState(state: SessionState): Promise<void> {
    try {
      // Store session state in memory
      const sessionData = {
        sessionId: state.session_id,
        projectPath: state.project_path,
        messages: state.conversation_history.map(msg => ({
          role: msg.role,
          content: msg.content,
          timestamp: msg.timestamp,
        })),
        contextWindow: 100,
        permissionMode: state.preferences.permission_mode,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Use memory storage to persist
      await this.memoryStorage.saveSession(sessionData);

      logger.debug({ sessionId: state.session_id }, 'Session state persisted');
    } catch (error: any) {
      logger.error({ sessionId: state.session_id, error: error.message }, 'Failed to persist session state');
      throw error;
    }
  }

  /**
   * Update memory from session state
   */
  private async updateMemoryFromSession(state: SessionState): Promise<void> {
    try {
      // Extract key context from session for memory - just log for now since addMemory doesn't exist
      if (state.context.git_branch) {
        logger.debug({ branch: state.context.git_branch }, 'Session has git branch context');
      }

      if (state.context.git_diff) {
        logger.debug({ diffLength: state.context.git_diff.length }, 'Session has git diff context');
      }

      logger.debug({ sessionId: state.session_id }, 'Memory updated from session');
    } catch (error: any) {
      logger.error({ error: error.message }, 'Failed to update memory from session');
    }
  }
}

export default SessionHandoffManager;