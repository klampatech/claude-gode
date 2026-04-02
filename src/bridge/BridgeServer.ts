/**
 * Bridge Server - Combines all bridge components into a unified server
 *
 * Integrates VS Code bridge, file sync, and session handoff into a single
 * server instance that can be started alongside the main CLI.
 */

import { VsCodeBridge, type VsCodeBridgeConfig } from './VsCodeBridge.js';
import { FileSync, type FileSyncConfig } from './FileSync.js';
import { SessionHandoffManager, type SessionHandoffConfig } from './SessionHandoff.js';
import { RemoteSession, type RemoteSessionConfig } from './RemoteSession.js';
import { OAuthFlow, type OAuthConfig } from './OAuthFlow.js';
import { SessionHandoff, type BridgeMessage } from './Protocol.js';
import { logger } from '../utils/logger.js';
import { createServer, Server } from 'http';

export interface BridgeServerConfig {
  port?: number;
  host?: string;
  project_path: string;
  vscode_config?: VsCodeBridgeConfig;
  file_sync_config?: FileSyncConfig;
  session_handoff_config?: SessionHandoffConfig;
  oauth_config?: OAuthConfig;
  enable_file_sync?: boolean;
  enable_session_handoff?: boolean;
  enable_remote_session?: boolean;
}

/**
 * Bridge Server - unified server for all bridge functionality
 */
export class BridgeServer {
  private config: Required<BridgeServerConfig>;
  private vscodeBridge: VsCodeBridge | null = null;
  private fileSync: FileSync | null = null;
  private sessionHandoff: SessionHandoffManager | null = null;
  private remoteSessions: Map<string, RemoteSession> = new Map();
  private oauthFlow: OAuthFlow | null = null;
  private httpServer: Server | null = null;
  private isRunning: boolean = false;

  constructor(config: BridgeServerConfig) {
    const oauthConfig = config.oauth_config;

    this.config = {
      port: config.port ?? 8765,
      host: config.host ?? 'localhost',
      project_path: config.project_path,
      vscode_config: config.vscode_config ?? { port: config.port ?? 8765, host: config.host ?? 'localhost' },
      file_sync_config: config.file_sync_config ?? { project_path: config.project_path },
      session_handoff_config: config.session_handoff_config ?? {},
      oauth_config: oauthConfig ?? {
        client_id: '',
        auth_url: '',
        token_url: '',
        scope: '',
        device_code_endpoint: '',
        token_refresh_threshold_ms: 60000,
      },
      enable_file_sync: config.enable_file_sync ?? true,
      enable_session_handoff: config.enable_session_handoff ?? true,
      enable_remote_session: config.enable_remote_session ?? false,
    };
  }

  /**
   * Start the bridge server
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      logger.warn('Bridge server already running');
      return;
    }

    logger.info({ port: this.config.port, host: this.config.host }, 'Starting bridge server');

    // Start VS Code WebSocket bridge
    this.vscodeBridge = new VsCodeBridge(this.config.vscode_config);
    await this.vscodeBridge.start();

    // Wire up bridge events to propagate to connected clients
    this.vscodeBridge.onFileEventHandler((event) => {
      this.vscodeBridge?.sendFileEvent(event);
    });

    this.vscodeBridge.onTerminalOutputHandler((output) => {
      this.vscodeBridge?.sendTerminalOutput(output);
    });

    // Start file sync if enabled
    if (this.config.enable_file_sync) {
      this.fileSync = new FileSync(this.config.file_sync_config);
      this.fileSync.start();

      this.fileSync.onFileEventHandler((event) => {
        this.vscodeBridge?.sendFileEvent(event);
      });
    }

    // Start session handoff manager if enabled
    if (this.config.enable_session_handoff) {
      this.sessionHandoff = new SessionHandoffManager(this.config.session_handoff_config);
    }

    // Initialize OAuth if configured
    if (this.config.oauth_config) {
      this.oauthFlow = new OAuthFlow(this.config.oauth_config);
    }

    // Start HTTP server for health checks and REST endpoints
    this.startHttpServer();

    this.isRunning = true;
    logger.info('Bridge server started successfully');
  }

  /**
   * Stop the bridge server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    logger.info('Stopping bridge server');

    // Stop file sync
    if (this.fileSync) {
      this.fileSync.stop();
    }

    // Disconnect all remote sessions
    for (const [, remoteSession] of this.remoteSessions) {
      await remoteSession.disconnect();
    }
    this.remoteSessions.clear();

    // Stop VS Code bridge
    if (this.vscodeBridge) {
      await this.vscodeBridge.stop();
    }

    // Stop HTTP server
    if (this.httpServer) {
      await new Promise<void>((resolve) => {
        this.httpServer?.close(() => resolve());
      });
    }

    this.isRunning = false;
    logger.info('Bridge server stopped');
  }

  /**
   * Connect to a remote Claude Code instance
   */
  async connectToRemote(config: RemoteSessionConfig): Promise<string> {
    const remoteSession = new RemoteSession(config);
    const sessionId = remoteSession.getClientId();

    remoteSession.onMessageHandler((message) => {
      // Handle incoming messages from remote
      this.handleRemoteMessage(message);
    });

    remoteSession.onConnectHandler(() => {
      logger.info({ sessionId, remoteUrl: config.remote_url }, 'Connected to remote');
    });

    remoteSession.onDisconnectHandler((reason) => {
      logger.info({ sessionId, reason }, 'Disconnected from remote');
      this.remoteSessions.delete(sessionId);
    });

    await remoteSession.connect();
    this.remoteSessions.set(sessionId, remoteSession);

    return sessionId;
  }

  /**
   * Disconnect from a remote session
   */
  async disconnectRemote(sessionId: string): Promise<void> {
    const remoteSession = this.remoteSessions.get(sessionId);
    if (remoteSession) {
      await remoteSession.disconnect();
      this.remoteSessions.delete(sessionId);
    }
  }

  /**
   * Start OAuth device code flow
   */
  async startOAuth(): Promise<{ userCode: string; verificationUri: string }> {
    if (!this.oauthFlow) {
      throw new Error('OAuth not configured');
    }
    return this.oauthFlow.start();
  }

  /**
   * Create session handoff
   */
  async createHandoff(
    sessionId: string,
    from: 'terminal' | 'vscode',
    to: 'terminal' | 'vscode',
    sessionState: Record<string, unknown>,
  ): Promise<SessionHandoff> {
    if (!this.sessionHandoff) {
      throw new Error('Session handoff not enabled');
    }

    if (from === 'terminal' && to === 'vscode') {
      return this.sessionHandoff.createTerminalToVsCodeHandoff(
        sessionId,
        sessionState.project_path,
        sessionState.conversation_history,
        sessionState.context,
        sessionState.preferences,
      );
    } else if (from === 'vscode' && to === 'terminal') {
      return this.sessionHandoff.createVsCodeToTerminalHandoff(
        sessionId,
        sessionState.project_path,
        sessionState.conversation_history,
        sessionState.context,
        sessionState.preferences,
      );
    }

    throw new Error(`Invalid handoff direction: ${from} -> ${to}`);
  }

  /**
   * Accept session handoff
   */
  async acceptHandoff(handoff: SessionHandoff): Promise<Record<string, unknown>> {
    if (!this.sessionHandoff) {
      throw new Error('Session handoff not enabled');
    }
    return this.sessionHandoff.acceptHandoff(handoff);
  }

  /**
   * Send terminal output to all connected clients
   */
  sendTerminalOutput(lines: string[], style?: string[]): void {
    this.vscodeBridge?.sendTerminalOutput({ lines, style: style ?? [] });
  }

  /**
   * Get server status
   */
  getStatus(): {
    running: boolean;
    port: number;
    host: string;
    connected_clients: number;
    remote_sessions: number;
    file_sync: boolean;
    session_handoff: boolean;
  } {
    return {
      running: this.isRunning,
      port: this.config.port,
      host: this.config.host,
      connected_clients: this.vscodeBridge?.getClientCount() ?? 0,
      remote_sessions: this.remoteSessions.size,
      file_sync: this.fileSync !== null,
      session_handoff: this.sessionHandoff !== null,
    };
  }

  /**
   * Check if server is running
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Start HTTP server for health and REST endpoints
   */
  private startHttpServer(): void {
    this.httpServer = createServer(async (req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
      }

      const path = req.url?.split('?')[0] ?? '';

      try {
        if (path === '/health') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(this.getStatus()));
        } else if (path === '/status') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            ...this.getStatus(),
            oauth: this.oauthFlow?.isAuthenticated() ?? false,
          }));
        } else {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Not found' }));
        }
      } catch (error) {
        const err = error as Error;
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });

    this.httpServer.listen(this.config.port, this.config.host, () => {
      logger.info({ port: this.config.port }, 'Bridge HTTP server listening');
    });
  }

  /**
   * Handle incoming message from remote session
   */
  private handleRemoteMessage(message: BridgeMessage<unknown>): void {
    // Forward to appropriate handler based on message type
    if (message.type === 'terminal_output') {
      // Terminal output from remote
    } else if (message.type === 'file_event') {
      // File event from remote
    } else if (message.type === 'session_handoff') {
      // Session handoff request
    }
  }
}

export default BridgeServer;