/**
 * LSP (Language Server Protocol) integration for symbol-level context.
 * Connects to LSP servers to provide type information, go-to-definition,
 * find references, and other IDE-like features.
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { logger } from '../utils/logger.js';
import { createLogContext } from '../utils/logger.js';

export interface LSPSymbol {
  name: string;
  kind: number;
  location: {
    uri: string;
    range: {
      start: { line: number; character: number };
      end: { line: number; character: number };
    };
  };
  containerName?: string;
}

export interface LSPHover {
  contents: string | string[];
  range?: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export interface LSPDefinition {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export interface LSPReferences {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

interface LSPMessage {
  jsonrpc: string;
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
}

const SymbolKind = {
  File: 1,
  Module: 2,
  Namespace: 3,
  Package: 4,
  Class: 5,
  Method: 6,
  Property: 7,
  Field: 8,
  Constructor: 9,
  Enum: 10,
  EnumMember: 11,
  Interface: 12,
  Function: 13,
  Variable: 14,
  Constant: 15,
  Parameter: 16,
  TypeParameter: 17,
};

/**
 * Language Server Protocol client for symbol-level context.
 */
export class LSPClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private projectPath: string;
  private languageId: string;
  private messageId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (reason: unknown) => void;
  }>();
  private ready = false;

  constructor(projectPath: string, languageId: string) {
    super();
    this.projectPath = projectPath;
    this.languageId = languageId;
  }

  /**
   * Start the LSP server for the given language.
   */
  async start(): Promise<void> {
    const ctx = createLogContext(undefined, this.projectPath);
    logger.info({ ...ctx, languageId: this.languageId }, 'Starting LSP server');

    // Select the appropriate language server command
    const serverCommand = this.getServerCommand();

    if (!serverCommand) {
      logger.warn({ ...ctx, languageId: this.languageId }, 'No LSP server available for language');
      return;
    }

    try {
      this.process = spawn(serverCommand.command, serverCommand.args, {
        cwd: this.projectPath,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleMessage(data.toString());
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        logger.debug({ ...ctx, error: data.toString() }, 'LSP stderr');
      });

      this.process.on('error', (error) => {
        logger.error({ ...ctx, error }, 'LSP process error');
        this.emit('error', error);
      });

      this.process.on('exit', (code) => {
        logger.info({ ...ctx, code }, 'LSP process exited');
        this.ready = false;
        this.emit('exit', code);
      });

      // Wait for server to initialize
      await this.initialize();
      this.ready = true;
      logger.info({ ...ctx, languageId: this.languageId }, 'LSP server ready');
    } catch (error) {
      logger.error({ ...ctx, error }, 'Failed to start LSP server');
      throw error;
    }
  }

  /**
   * Stop the LSP server.
   */
  stop(): void {
    if (this.process) {
      this.send({ jsonrpc: '2.0', method: 'shutdown' });
      this.process.kill();
      this.process = null;
      this.ready = false;
    }
  }

  /**
   * Check if LSP is ready.
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Get symbols in a document (document symbols).
   */
  async getDocumentSymbols(uri: string): Promise<LSPSymbol[]> {
    if (!this.ready) return [];

    const result = await this.sendRequest('textDocument/documentSymbol', {
      textDocument: { uri },
    });

    return (result as LSPSymbol[] | undefined) || [];
  }

  /**
   * Get symbols in the workspace (workspace symbols).
   */
  async getWorkspaceSymbols(query: string): Promise<LSPSymbol[]> {
    if (!this.ready) return [];

    const result = await this.sendRequest('workspace/symbol', {
      query,
    });

    return (result as LSPSymbol[] | undefined) || [];
  }

  /**
   * Get hover information at a position.
   */
  async getHover(uri: string, line: number, column: number): Promise<LSPHover | null> {
    if (!this.ready) return null;

    const result = await this.sendRequest('textDocument/hover', {
      textDocument: { uri },
      position: { line, character: column },
    });

    return (result as LSPHover | undefined) || null;
  }

  /**
   * Go to definition at a position.
   */
  async getDefinition(uri: string, line: number, column: number): Promise<LSPDefinition | null> {
    if (!this.ready) return null;

    const result = await this.sendRequest('textDocument/definition', {
      textDocument: { uri },
      position: { line, character: column },
    });

    if (!result) return null;

    const def = result as { uri: string; range: LSPDefinition['range'] };
    return { uri: def.uri, range: def.range };
  }

  /**
   * Find references at a position.
   */
  async getReferences(uri: string, line: number, column: number): Promise<LSPReferences[]> {
    if (!this.ready) return [];

    const result = await this.sendRequest('textDocument/references', {
      textDocument: { uri },
      position: { line, character: column },
      context: { includeDeclaration: true },
    });

    return (result as LSPReferences[] | undefined) || [];
  }

  /**
   * Get code completions at a position.
   */
  async getCompletions(uri: string, line: number, column: number): Promise<Array<{
    label: string;
    kind: number;
    detail?: string;
    documentation?: string;
  }>> {
    if (!this.ready) return [];

    const result = await this.sendRequest('textDocument/completion', {
      textDocument: { uri },
      position: { line, character: column },
    });

    const completions = result as { items?: Array<{
      label: string;
      kind: number;
      detail?: string;
      documentation?: string;
    }> };

    return completions?.items || [];
  }

  private getServerCommand(): { command: string; args: string[] } | null {
    // Language server commands for common languages
    const servers: Record<string, { command: string; args: string[] }> = {
      typescript: {
        command: 'typescript-language-server',
        args: ['--stdio'],
      },
      javascript: {
        command: 'typescript-language-server',
        args: ['--stdio'],
      },
      python: {
        command: 'pylsp',
        args: [],
      },
      go: {
        command: 'gopls',
        args: [],
      },
      rust: {
        command: 'rust-analyzer',
        args: [],
      },
      java: {
        command: 'jdtls',
        args: [],
      },
      cpp: {
        command: 'clangd',
        args: ['--background-index'],
      },
      c: {
        command: 'clangd',
        args: ['--background-index'],
      },
    };

    return servers[this.languageId] || null;
  }

  private async initialize(): Promise<void> {
    // Send initialize request
    const result = await this.sendRequest('initialize', {
      processId: process.pid,
      rootUri: `file://${this.projectPath}`,
      capabilities: {
        textDocument: {
          synchronization: { didSave: true },
          hover: true,
          definition: true,
          references: true,
          documentSymbol: true,
          completion: { completionItem: { snippetSupport: true } },
        },
        workspace: {
          symbol: true,
        },
      },
    });

    // Store capabilities (unused but available for future use)
    void (result as { capabilities?: Record<string, unknown> })?.capabilities;

    // Send initialized notification
    this.send({
      jsonrpc: '2.0',
      method: 'initialized',
      params: {},
    });
  }

  private send(message: Partial<LSPMessage>): void {
    if (!this.process?.stdin) return;

    const fullMessage = JSON.stringify(message);
    this.process.stdin.write(`Content-Length: ${fullMessage.length}\r\n\r\n${fullMessage}`);
  }

  private sendRequest<T>(method: string, params: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      const id = ++this.messageId;
      this.pendingRequests.set(id, { resolve: resolve as (value: unknown) => void, reject });

      this.send({ jsonrpc: '2.0', id, method, params });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error(`LSP request ${method} timed out`));
        }
      }, 30000);
    });
  }

  private handleMessage(data: string): void {
    // Parse LSP messages (could be multiple concatenated)
    const parts = data.split('\r\n\r\n');

    for (const part of parts) {
      if (!part.startsWith('{')) continue;

      try {
        const message: LSPMessage = JSON.parse(part);

        if (message.id && this.pendingRequests.has(message.id)) {
          const pending = this.pendingRequests.get(message.id)!;
          this.pendingRequests.delete(message.id);

          if (message.error) {
            pending.reject(new Error(message.error.message));
          } else {
            pending.resolve(message.result);
          }
        } else if (message.method?.startsWith('$')) {
          // Handle progress notifications, etc.
        }
      } catch {
        // Ignore parse errors
      }
    }
  }
}

/**
 * Create an LSP client for a project and language.
 */
export function createLSPClient(projectPath: string, languageId: string): LSPClient {
  return new LSPClient(projectPath, languageId);
}

export { SymbolKind };

/**
 * Get language ID from file extension.
 */
export function getLanguageId(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    go: 'go',
    rs: 'rust',
    java: 'java',
    cpp: 'cpp',
    c: 'c',
    h: 'c',
    hpp: 'cpp',
  };

  return langMap[ext] || 'unknown';
}