/**
 * VS Code Bridge - WebSocket bridge for VS Code extension communication
 *
 * Provides bidirectional communication between Claude Code and VS Code,
 * handling terminal output mirroring, file events, and agent commands.
 */

import WebSocket from 'ws';
import { v4 as uuidv4 } from 'uuid';
import {
  BridgeMessage,
  BridgeMessageType,
  FileEvent,
  TerminalOutput,
  AgentCommand,
  SessionHandoff,
  ConnectionInfo,
  createBridgeMessage,
} from './Protocol.js';
import { logger } from '../utils/logger.js';

export interface VsCodeBridgeConfig {
  port: number;
  host?: string;
  jwt_secret?: string;
  max_reconnect_attempts?: number;
  reconnect_delay_ms?: number;
  heartbeat_interval_ms?: number;
}

/**
 * Connection state
 */
enum ConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  RECONNECTING = 'reconnecting',
}

/**
 * VS Code Bridge for WebSocket communication with VS Code extension
 */
export class VsCodeBridge {
  private config: Required<VsCodeBridgeConfig>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private server: any = null;
  private clients: Map<string, WebSocket> = new Map();
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private sessionId: string = uuidv4();
  private heartbeatTimer: NodeJS.Timeout | null = null;

  // Event handlers
  private onFileEvent?: (event: FileEvent) => void;
  private onTerminalOutput?: (output: TerminalOutput) => void;
  private onAgentCommand?: (command: AgentCommand) => void;
  private onSessionHandoff?: (handoff: SessionHandoff) => void;
  private onConnectionChange?: (state: ConnectionState, clientId?: string) => void;
  private onError?: (error: Error) => void;

  constructor(config: VsCodeBridgeConfig) {
    this.config = {
      port: config.port,
      host: config.host ?? 'localhost',
      jwt_secret: config.jwt_secret ?? '',
      max_reconnect_attempts: config.max_reconnect_attempts ?? 5,
      reconnect_delay_ms: config.reconnect_delay_ms ?? 1000,
      heartbeat_interval_ms: config.heartbeat_interval_ms ?? 30000,
    };
  }

  /**
   * Start the bridge server
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.server = new (WebSocket as any).Server({
          port: this.config.port,
          host: this.config.host,
        });

        this.server.on('listening', () => {
          this.state = ConnectionState.CONNECTED;
          logger.info(
            { port: this.config.port, host: this.config.host },
            'VS Code Bridge server started',
          );
          this.startHeartbeat();
          resolve();
        });

        this.server.on('connection', (ws: WebSocket, req: { url?: string }) => {
          this.handleConnection(ws, req);
        });

        this.server.on('error', (error: Error) => {
          logger.error({ error: error.message }, 'VS Code Bridge server error');
          this.state = ConnectionState.DISCONNECTED;
          if (this.onError) {
            this.onError(error);
          }
          reject(error);
        });

        this.server.on('close', () => {
          logger.info('VS Code Bridge server closed');
          this.state = ConnectionState.DISCONNECTED;
          this.stopHeartbeat();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the bridge server
   */
  async stop(): Promise<void> {
    this.stopHeartbeat();

    // Close all client connections
    for (const [clientId, ws] of this.clients) {
      ws.close();
      logger.debug({ clientId }, 'Closed client connection');
    }
    this.clients.clear();

    // Close server
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('VS Code Bridge server stopped');
          this.state = ConnectionState.DISCONNECTED;
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Connect as client to a remote bridge server
   */
  async connect(serverUrl: string, connectionInfo: ConnectionInfo): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(serverUrl);

      ws.on('open', () => {
        this.state = ConnectionState.CONNECTED;
        this.clients.set(connectionInfo.client_id, ws);

        // Send connection message
        const connectMsg = createBridgeMessage(
          BridgeMessageType.CONNECT,
          connectionInfo,
          this.sessionId,
        );
        ws.send(JSON.stringify(connectMsg));

        this.startHeartbeat();
        logger.info({ serverUrl }, 'Connected to bridge server');
        resolve();
      });

      ws.on('message', (data) => {
        this.handleMessage(connectionInfo.client_id, data.toString());
      });

      ws.on('close', () => {
        const client = this.clients.get(connectionInfo.client_id);
        if (client) {
          this.clients.delete(connectionInfo.client_id);
        }
        this.state = ConnectionState.DISCONNECTED;
        this.stopHeartbeat();
        logger.info({ clientId: connectionInfo.client_id }, 'Disconnected from bridge');
      });

      ws.on('error', (error) => {
        logger.error({ error: error.message, clientId: connectionInfo.client_id }, 'Client error');
        if (this.onError) {
          this.onError(error);
        }
        reject(error);
      });
    });
  }

  /**
   * Disconnect a client
   */
  disconnect(clientId: string): void {
    const ws = this.clients.get(clientId);
    if (ws) {
      ws.close();
      this.clients.delete(clientId);
      logger.info({ clientId }, 'Client disconnected');
    }
  }

  /**
   * Send file event to all connected clients
   */
  sendFileEvent(event: FileEvent): void {
    const message = createBridgeMessage(BridgeMessageType.FILE_EVENT, event, this.sessionId);
    this.broadcast(message);
  }

  /**
   * Send terminal output to all connected clients
   */
  sendTerminalOutput(output: TerminalOutput): void {
    const message = createBridgeMessage(
      BridgeMessageType.TERMINAL_OUTPUT,
      output,
      this.sessionId,
    );
    this.broadcast(message);
  }

  /**
   * Send session handoff to a specific client
   */
  sendSessionHandoff(clientId: string, handoff: SessionHandoff): void {
    const ws = this.clients.get(clientId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      const message = createBridgeMessage(
        BridgeMessageType.SESSION_HANDOFF,
        handoff,
        this.sessionId,
      );
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Send error to a specific client
   */
  sendError(clientId: string, code: string, message: string, details?: Record<string, unknown>): void {
    const ws = this.clients.get(clientId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      const errorPayload = { code, message, details };
      const msg = createBridgeMessage(BridgeMessageType.ERROR, errorPayload, this.sessionId);
      ws.send(JSON.stringify(msg));
    }
  }

  /**
   * Set file event handler
   */
  onFileEventHandler(handler: (event: FileEvent) => void): void {
    this.onFileEvent = handler;
  }

  /**
   * Set terminal output handler
   */
  onTerminalOutputHandler(handler: (output: TerminalOutput) => void): void {
    this.onTerminalOutput = handler;
  }

  /**
   * Set agent command handler
   */
  onAgentCommandHandler(handler: (command: AgentCommand) => void): void {
    this.onAgentCommand = handler;
  }

  /**
   * Set session handoff handler
   */
  onSessionHandoffHandler(handler: (handoff: SessionHandoff) => void): void {
    this.onSessionHandoff = handler;
  }

  /**
   * Set connection change handler
   */
  onConnectionChangeHandler(handler: (state: ConnectionState, clientId?: string) => void): void {
    this.onConnectionChange = handler;
  }

  /**
   * Set error handler
   */
  onErrorHandler(handler: (error: Error) => void): void {
    this.onError = handler;
  }

  /**
   * Get connection state
   */
  getState(): ConnectionState {
    return this.state;
  }

  /**
   * Get connected client count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Handle incoming WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: { url?: string }): void {
    const clientId = uuidv4();
    this.clients.set(clientId, ws);

    logger.info({ clientId, url: req.url }, 'New client connected');
    this.onConnectionChange?.(ConnectionState.CONNECTED, clientId);

    ws.on('message', (data) => {
      this.handleMessage(clientId, data.toString());
    });

    ws.on('close', () => {
      this.clients.delete(clientId);
      logger.info({ clientId }, 'Client disconnected');
      this.onConnectionChange?.(ConnectionState.DISCONNECTED, clientId);
    });

    ws.on('error', (error) => {
      logger.error({ clientId, error: error.message }, 'Client WebSocket error');
    });
  }

  /**
   * Handle incoming message
   */
  private handleMessage(clientId: string, data: string): void {
    try {
      const message = JSON.parse(data) as BridgeMessage;

      switch (message.type) {
        case BridgeMessageType.CONNECT:
          logger.info({ clientId }, 'Client connection handshake received');
          break;

        case BridgeMessageType.FILE_EVENT:
          if (this.onFileEvent) {
            this.onFileEvent(message.payload as FileEvent);
          }
          break;

        case BridgeMessageType.TERMINAL_OUTPUT:
          if (this.onTerminalOutput) {
            this.onTerminalOutput(message.payload as TerminalOutput);
          }
          break;

        case BridgeMessageType.AGENT_COMMAND:
          if (this.onAgentCommand) {
            this.onAgentCommand(message.payload as AgentCommand);
          }
          break;

        case BridgeMessageType.SESSION_HANDOFF:
          if (this.onSessionHandoff) {
            this.onSessionHandoff(message.payload as SessionHandoff);
          }
          break;

        case BridgeMessageType.HEARTBEAT:
          // Respond to heartbeat
          break;

        default:
          logger.warn({ clientId, type: message.type }, 'Unknown message type');
      }
    } catch (error) {
      logger.error({ clientId, error }, 'Failed to parse message');
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  private broadcast(message: BridgeMessage): void {
    const data = JSON.stringify(message);
    for (const [clientId, ws] of this.clients) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data);
      } else {
        logger.warn({ clientId }, 'Client not ready, skipping broadcast');
      }
    }
  }

  /**
   * Start heartbeat timer
   */
  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatTimer = setInterval(() => {
      const heartbeatMsg = createBridgeMessage(
        BridgeMessageType.HEARTBEAT,
        { client_id: 'server', last_activity: new Date().toISOString() },
        this.sessionId,
      );
      this.broadcast(heartbeatMsg);
    }, this.config.heartbeat_interval_ms);
  }

  /**
   * Stop heartbeat timer
   */
  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }
}

export default VsCodeBridge;