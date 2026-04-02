/**
 * MCP (Model Context Protocol) Tool - Client and Server implementations
 *
 * MCP is a protocol for connecting AI assistants to external tools and data sources.
 * This implementation provides both MCP client (connect to remote MCP servers)
 * and MCP server (expose Claude Code tools via MCP) capabilities.
 */

import { z } from 'zod';
import * as ws from 'ws';
import { logger } from '../utils/logger.js';
import type { Tool, ToolContext, ToolResult } from '../Tool.js';

/**
 * MCP message types
 */
export type MCPMessageType =
  | 'initialize'
  | 'initialized'
  | 'tools/list'
  | 'tools/list_changed'
  | 'tools/call'
  | 'resources/list'
  | 'resources/read'
  | 'prompts/list'
  | 'prompts/get'
  | 'ping'
  | 'pong'
  | 'cancel'
  | 'close';

/**
 * MCP message structure
 */
export interface MCPMessage {
  jsonrpc: '2.0';
  id?: string | number;
  method?: MCPMessageType;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * MCP tool definition
 */
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

/**
 * MCP server configuration
 */
export interface MCPServerConfig {
  port: number;
  host?: string;
  tools?: MCPToolDefinition[];
}

/**
 * MCP client connection
 */
class MCPClientConnection {
  private socket: ws.WebSocket | null = null;
  private pendingRequests: Map<string | number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
  }> = new Map();
  private messageId = 0;
  private connected = false;

  constructor(private url: string) {}

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new ws.WebSocket(this.url);

      this.socket.on('open', () => {
        this.connected = true;
        logger.info({ url: this.url }, 'MCP client connected');
        resolve();
      });

      this.socket.on('message', (data) => {
        try {
          const message: MCPMessage = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (error) {
          logger.error({ error }, 'Failed to parse MCP message');
        }
      });

      this.socket.on('error', (error) => {
        logger.error({ error, url: this.url }, 'MCP client error');
        reject(error);
      });

      this.socket.on('close', () => {
        this.connected = false;
        logger.info({ url: this.url }, 'MCP client disconnected');
      });
    });
  }

  private handleMessage(message: MCPMessage): void {
    if (message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
        this.pendingRequests.delete(message.id);
      }
    }
  }

  async sendRequest<T = unknown>(method: MCPMessageType, params?: Record<string, unknown>): Promise<T> {
    if (!this.socket || this.socket.readyState !== ws.WebSocket.OPEN) {
      throw new Error('MCP client not connected');
    }

    const id = ++this.messageId;
    const message: MCPMessage = {
      jsonrpc: '2.0',
      id,
      method,
      params: params || {},
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject });
      this.socket?.send(JSON.stringify(message));

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`MCP request ${method} timed out`));
        }
      }, 30000);
    });
  }

  async listTools(): Promise<MCPToolDefinition[]> {
    const result = await this.sendRequest<{ tools: MCPToolDefinition[] }>('tools/list');
    return result?.tools || [];
  }

  async callTool(toolName: string, arguments_: Record<string, unknown>): Promise<unknown> {
    return this.sendRequest('tools/call', {
      name: toolName,
      arguments: arguments_,
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * MCP Server implementation
 */
export class MCPServer {
  private wss: ws.WebSocketServer | null = null;
  private tools: MCPToolDefinition[] = [];
  private connections: Set<ws.WebSocket> = new Set();

  constructor(private config: MCPServerConfig) {
    this.tools = config.tools || [];
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.wss = new ws.WebSocketServer({
        port: this.config.port,
        host: this.config.host,
      });

      this.wss.on('listening', () => {
        logger.info({ port: this.config.port }, 'MCP server started');
        resolve();
      });

      this.wss.on('connection', (socket) => {
        this.handleConnection(socket);
      });
    });
  }

  private handleConnection(socket: ws.WebSocket): void {
    this.connections.add(socket);
    logger.debug({ connectionCount: this.connections.size }, 'MCP client connected');

    socket.on('message', (data) => {
      try {
        const message: MCPMessage = JSON.parse(data.toString());
        this.handleMessage(socket, message);
      } catch (error) {
        logger.error({ error }, 'Failed to parse MCP message');
      }
    });

    socket.on('close', () => {
      this.connections.delete(socket);
      logger.debug({ connectionCount: this.connections.size }, 'MCP client disconnected');
    });
  }

  private async handleMessage(socket: ws.WebSocket, message: MCPMessage): Promise<void> {
    const { method, params, id } = message;
    let result: unknown;

    switch (method) {
      case 'initialize':
        result = {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
          },
          serverInfo: {
            name: 'claude-code',
            version: '0.1.0',
          },
        };
        break;

      case 'tools/list':
        result = { tools: this.tools };
        break;

      case 'tools/call':
        if (params && typeof params.name === 'string') {
          // Execute tool - placeholder for actual tool execution
          result = {
            content: [
              {
                type: 'text',
                text: `Tool ${params.name} executed with params: ${JSON.stringify(params.arguments || {})}`,
              },
            ],
          };
        }
        break;

      case 'ping':
        result = null;
        break;

      default:
        logger.warn({ method }, 'Unknown MCP method');
        result = null;
    }

    const response: MCPMessage = {
      jsonrpc: '2.0',
      id: id ?? 0,
      result,
    };

    socket.send(JSON.stringify(response));
  }

  stop(): void {
    for (const conn of this.connections) {
      conn.close();
    }
    this.connections.clear();
    this.wss?.close();
    this.wss = null;
    logger.info({ port: this.config.port }, 'MCP server stopped');
  }

  registerTool(tool: MCPToolDefinition): void {
    this.tools.push(tool);
    this.broadcastToolsChanged();
  }

  private broadcastToolsChanged(): void {
    const message: MCPMessage = {
      jsonrpc: '2.0',
      method: 'tools/list_changed',
    };

    for (const conn of this.connections) {
      if (conn.readyState === ws.WebSocket.OPEN) {
        conn.send(JSON.stringify(message));
      }
    }
  }
}

/**
 * MCPTool - Execute tools via MCP protocol
 */
export class MCPTool implements Tool {
  public name = 'MCP';
  public description = 'Connect to MCP servers and execute remote tools';

  public inputSchema = z.object({
    action: z.enum(['connect', 'disconnect', 'list_tools', 'call_tool', 'start_server', 'stop_server'])
      .describe('MCP action to perform'),
    serverUrl: z.string().optional().describe('MCP server URL (for client actions)'),
    serverPort: z.number().optional().describe('MCP server port (for server actions)'),
    toolName: z.string().optional().describe('Tool name to call'),
    toolArgs: z.record(z.unknown()).optional().describe('Arguments for tool call'),
  });

  // Store active client connections
  private static clientConnections: Map<string, MCPClientConnection> = new Map();
  // Store active server instances
  private static serverInstances: Map<number, MCPServer> = new Map();

  async execute(
    input: z.infer<typeof this.inputSchema>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const { traceId } = context;

    logger.info({ action: input.action, traceId }, 'MCPTool execution started');

    try {
      switch (input.action) {
        case 'connect': {
          if (!input.serverUrl) {
            throw new Error('serverUrl is required for connect action');
          }
          const client = new MCPClientConnection(input.serverUrl);
          await client.connect();
          MCPTool.clientConnections.set(input.serverUrl, client);

          return {
            data: { status: 'connected', url: input.serverUrl },
            error: null,
            metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
          };
        }

        case 'disconnect': {
          if (!input.serverUrl) {
            throw new Error('serverUrl is required for disconnect action');
          }
          const client = MCPTool.clientConnections.get(input.serverUrl);
          if (client) {
            client.disconnect();
            MCPTool.clientConnections.delete(input.serverUrl);
          }

          return {
            data: { status: 'disconnected', url: input.serverUrl },
            error: null,
            metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
          };
        }

        case 'list_tools': {
          if (!input.serverUrl) {
            throw new Error('serverUrl is required for list_tools action');
          }
          const client = MCPTool.clientConnections.get(input.serverUrl);
          if (!client || !client.isConnected()) {
            throw new Error('Not connected to MCP server');
          }
          const tools = await client.listTools();

          return {
            data: { tools },
            error: null,
            metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
          };
        }

        case 'call_tool': {
          if (!input.serverUrl || !input.toolName) {
            throw new Error('serverUrl and toolName are required for call_tool action');
          }
          const client = MCPTool.clientConnections.get(input.serverUrl);
          if (!client || !client.isConnected()) {
            throw new Error('Not connected to MCP server');
          }
          const result = await client.callTool(input.toolName, input.toolArgs || {});

          return {
            data: { result },
            error: null,
            metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
          };
        }

        case 'start_server': {
          const port = input.serverPort || 3000;
          const server = new MCPServer({ port, tools: [] });
          await server.start();
          MCPTool.serverInstances.set(port, server);

          return {
            data: { status: 'started', port },
            error: null,
            metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
          };
        }

        case 'stop_server': {
          const port = input.serverPort || 3000;
          const server = MCPTool.serverInstances.get(port);
          if (server) {
            server.stop();
            MCPTool.serverInstances.delete(port);
          }

          return {
            data: { status: 'stopped', port },
            error: null,
            metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
          };
        }

        default:
          throw new Error(`Unknown action: ${input.action}`);
      }
    } catch (error) {
      logger.error({ error, action: input.action, traceId }, 'MCPTool failed');

      return {
        data: null,
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: {
          duration_ms: Date.now() - startTime,
          trace_id: traceId,
        },
      };
    }
  }
}
