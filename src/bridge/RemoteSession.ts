/**
 * Remote Session - Handles remote/teleport connections to Claude Code
 *
 * Enables connecting to Claude Code running on a remote server or container,
 * maintaining a stable connection with automatic reconnection.
 */

import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import {
  BridgeMessage,
  BridgeMessageType,
  ConnectionInfo,
  createBridgeMessage,
} from './Protocol.js';
import { logger } from '../utils/logger.js';

export interface RemoteSessionConfig {
  remote_url: string;
  client_id?: string;
  client_type?: 'vscode' | 'terminal' | 'remote';
  capabilities?: string[];
  version?: string;
  reconnect_options?: {
    maxRetries?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffMultiplier?: number;
  };
  connection_timeout_ms?: number;
}

/**
 * Remote session connection state
 */
export enum RemoteConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
  FAILED = 'failed',
}

/**
 * Remote session for teleporting to Claude Code on a remote machine
 */
export class RemoteSession {
  private config: Required<RemoteSessionConfig>;
  private ws: WebSocket | null = null;
  private state: RemoteConnectionState = RemoteConnectionState.DISCONNECTED;
  private clientId: string;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private reconnectDelayMs: number = 1000;

  // Message queue for offline buffering
  private messageQueue: BridgeMessage[] = [];

  // Event handlers
  private onConnect?: () => void;
  private onDisconnect?: (reason: string) => void;
  private onMessage?: (message: BridgeMessage) => void;
  private onError?: (error: Error) => void;
  private onStateChange?: (state: RemoteConnectionState) => void;

  constructor(config: RemoteSessionConfig) {
    this.clientId = config.client_id ?? uuidv4();

    const reconnectOpts = config.reconnect_options ?? {};
    this.maxReconnectAttempts = reconnectOpts.maxRetries ?? 5;
    this.reconnectDelayMs = reconnectOpts.initialDelayMs ?? 1000;

    const maxDelay = reconnectOpts.maxDelayMs ?? 30000;
    const backoffMult = reconnectOpts.backoffMultiplier ?? 2;
    const initialDelay = this.reconnectDelayMs;

    this.config = {
      remote_url: config.remote_url,
      client_id: this.clientId,
      client_type: config.client_type ?? 'remote',
      capabilities: config.capabilities ?? ['terminal_output', 'file_events', 'agent_commands'],
      version: config.version ?? '1.0.0',
      reconnect_options: {
        maxRetries: this.maxReconnectAttempts,
        initialDelayMs: initialDelay,
        maxDelayMs: maxDelay,
        backoffMultiplier: backoffMult,
      },
      connection_timeout_ms: config.connection_timeout_ms ?? 10000,
    };
  }

  /**
   * Connect to remote Claude Code instance
   */
  async connect(): Promise<void> {
    if (this.state === RemoteConnectionState.CONNECTED) {
      logger.warn('Already connected to remote session');
      return;
    }

    this.setState(RemoteConnectionState.CONNECTING);

    return new Promise((resolve, reject) => {
      const connectionTimeout = setTimeout(() => {
        this.setState(RemoteConnectionState.FAILED);
        reject(new Error('Connection timeout'));
      }, this.config.connection_timeout_ms);

      try {
        this.ws = new WebSocket(this.config.remote_url);

        this.ws.on('open', () => {
          clearTimeout(connectionTimeout);
          this.setState(RemoteConnectionState.CONNECTED);

          // Send connection info
          const connectionInfo: ConnectionInfo = {
            client_id: this.clientId,
            client_type: this.config.client_type,
            capabilities: this.config.capabilities,
            version: this.config.version,
          };

          const connectMsg = createBridgeMessage(
            BridgeMessageType.CONNECT,
            connectionInfo,
            uuidv4(),
          );
          this.ws?.send(JSON.stringify(connectMsg));

          // Flush queued messages
          this.flushMessageQueue();

          logger.info({ remoteUrl: this.config.remote_url }, 'Connected to remote session');
          this.onConnect?.();
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const message = JSON.parse(data.toString()) as BridgeMessage;
            this.onMessage?.(message);
          } catch (error) {
            logger.error({ error }, 'Failed to parse message');
          }
        });

        this.ws.on('close', (code, reason) => {
          const reasonStr = reason.toString() || `Code: ${code}`;
          logger.info({ code, reason: reasonStr }, 'Remote session disconnected');
          this.setState(RemoteConnectionState.DISCONNECTED);
          this.onDisconnect?.(reasonStr);
          this.attemptReconnect();
        });

        this.ws.on('error', (error) => {
          clearTimeout(connectionTimeout);
          logger.error({ error: error.message }, 'Remote session error');
          this.setState(RemoteConnectionState.FAILED);
          this.onError?.(error);
          reject(error);
        });
      } catch (error) {
        clearTimeout(connectionTimeout);
        this.setState(RemoteConnectionState.FAILED);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from remote session
   */
  async disconnect(): Promise<void> {
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnection

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setState(RemoteConnectionState.DISCONNECTED);
    logger.info('Disconnected from remote session');
  }

  /**
   * Send message to remote session
   */
  send<T>(type: BridgeMessageType, payload: T, sessionId?: string): void {
    const message = createBridgeMessage(type, payload, sessionId ?? uuidv4());

    if (this.state === RemoteConnectionState.CONNECTED && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      // Queue message for later
      this.messageQueue.push(message);
      logger.debug({ type, queued: true }, 'Message queued (offline)');
    }
  }

  /**
   * Send terminal output to remote
   */
  sendTerminalOutput(lines: string[], style?: string[]): void {
    this.send(BridgeMessageType.TERMINAL_OUTPUT, { lines, style });
  }

  /**
   * Send file event to remote
   */
  sendFileEvent(type: 'changed' | 'created' | 'deleted', path: string, content?: string): void {
    this.send(BridgeMessageType.FILE_EVENT, { type, path, content });
  }

  /**
   * Request session handoff from remote
   */
  requestSessionHandoff(target: 'terminal' | 'vscode'): void {
    this.send(BridgeMessageType.SESSION_HANDOFF, { request: true, target });
  }

  /**
   * Set connect handler
   */
  onConnectHandler(handler: () => void): void {
    this.onConnect = handler;
  }

  /**
   * Set disconnect handler
   */
  onDisconnectHandler(handler: (reason: string) => void): void {
    this.onDisconnect = handler;
  }

  /**
   * Set message handler
   */
  onMessageHandler(handler: (message: BridgeMessage) => void): void {
    this.onMessage = handler;
  }

  /**
   * Set error handler
   */
  onErrorHandler(handler: (error: Error) => void): void {
    this.onError = handler;
  }

  /**
   * Set state change handler
   */
  onStateChangeHandler(handler: (state: RemoteConnectionState) => void): void {
    this.onStateChange = handler;
  }

  /**
   * Get current connection state
   */
  getState(): RemoteConnectionState {
    return this.state;
  }

  /**
   * Get client ID
   */
  getClientId(): string {
    return this.clientId;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.state === RemoteConnectionState.CONNECTED;
  }

  /**
   * Get connection URL
   */
  getRemoteUrl(): string {
    return this.config.remote_url;
  }

  /**
   * Attempt to reconnect
   */
  private async attemptReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error({ attempts: this.reconnectAttempts }, 'Max reconnection attempts reached');
      this.setState(RemoteConnectionState.FAILED);
      return;
    }

    this.reconnectAttempts++;
    this.setState(RemoteConnectionState.RECONNECTING);

    logger.info(
      { attempt: this.reconnectAttempts, max: this.maxReconnectAttempts, delay: this.reconnectDelayMs },
      'Attempting to reconnect',
    );

    await this.sleep(this.reconnectDelayMs);

    // Exponential backoff
    const backoffMult = this.config.reconnect_options.backoffMultiplier;
    const maxDelay = this.config.reconnect_options.maxDelayMs;
    const initialDelay = this.config.reconnect_options.initialDelayMs;

    this.reconnectDelayMs = Math.min(
      this.reconnectDelayMs * (backoffMult ?? 2),
      maxDelay ?? 30000,
    );

    try {
      await this.connect();
      this.reconnectAttempts = 0;
      this.reconnectDelayMs = initialDelay ?? 1000;
    } catch (error) {
      // Reconnect will be attempted again via close handler
    }
  }

  /**
   * Flush queued messages
   */
  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift();
      if (message) {
        this.ws.send(JSON.stringify(message));
      }
    }
    this.messageQueue = [];
  }

  /**
   * Set connection state
   */
  private setState(state: RemoteConnectionState): void {
    if (this.state !== state) {
      this.state = state;
      this.onStateChange?.(state);
      logger.debug({ state }, 'Remote session state changed');
    }
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default RemoteSession;