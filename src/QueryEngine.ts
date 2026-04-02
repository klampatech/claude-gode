import { logger } from './utils/logger.js';
import { v4 as uuidv4 } from 'uuid';

export interface Message {
  role: 'user' | 'assistant' | 'tool';
  content: string;
  toolUse?: {
    tool: string;
    input: Record<string, unknown>;
  };
  toolResult?: {
    toolUseId: string;
    content: string;
    isError?: boolean;
  };
  metadata?: {
    timestamp: string;
    sessionId: string;
    model: string;
  };
}

export interface ToolResult {
  data: unknown;
  error: Error | null;
  metadata: {
    duration_ms: number;
    trace_id: string;
  };
}

export interface QueryEngineOptions {
  projectPath: string;
  contextWindow: number;
  permissionMode: 'ask' | 'allow' | 'deny' | 'limited';
}

export interface ConversationContext {
  gitState?: string;
  fileTree?: string;
  lspSymbols?: string;
  envVars?: string;
  memories?: string;
  sessionMem?: string;
}

export class QueryEngine {
  private sessionId: string;
  private messages: Message[] = [];
  private options: QueryEngineOptions;

  constructor(options: QueryEngineOptions) {
    this.sessionId = uuidv4();
    this.options = options;
    logger.info({ sessionId: this.sessionId }, 'QueryEngine initialized');
  }

  private async buildContext(): Promise<ConversationContext> {
    const context: ConversationContext = {};

    try {
      const { execa } = await import('execa');
      const gitState = await execa('git', [
        'status',
        '--short',
      ]).catch(() => ({ stdout: '' }));
      const gitLog = await execa('git', [
        'log',
        '--oneline',
        '-10',
      ]).catch(() => ({ stdout: '' }));
      context.gitState = `${gitState.stdout}\n${gitLog.stdout}`;
    } catch {
      context.gitState = 'Not a git repository';
    }

    context.fileTree = await this.getFileTree();

    return context;
  }

  private async getFileTree(): Promise<string> {
    try {
      const { execa } = await import('execa');
      const tree = await execa('find', [
        this.options.projectPath,
        '-type',
        'f',
        '-name',
        '*.ts',
        '-o',
        '-name',
        '*.tsx',
        '-o',
        '-name',
        '*.js',
        '-o',
        '-name',
        '*.json',
      ]).catch(() => ({ stdout: '' }));
      return tree.stdout;
    } catch {
      return '';
    }
  }

  private async buildPrompt(
    userInput: string,
    context: ConversationContext,
  ): Promise<string> {
    const contextSection = `## Project Context\n\n### Git State\n\`\`\`\n${context.gitState || 'N/A'}\n\`\`\`\n\n### File Tree\n\`\`\`\n${context.fileTree || 'N/A'}\n\`\`\`\n`;

    return `${contextSection}\n## User Request\n${userInput}`;
  }

  async processQuery(userInput: string): Promise<void> {
    const traceId = uuidv4();
    logger.info({ traceId, userInput }, 'Processing query');

    const context = await this.buildContext();
    const prompt = await this.buildPrompt(userInput, context);

    this.messages.push({
      role: 'user',
      content: userInput,
      metadata: {
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        model: 'claude-code',
      },
    });

    // Placeholder for actual AI processing - in production this would use Google ADK
    const response = await this.callModel(prompt, traceId);

    this.messages.push({
      role: 'assistant',
      content: response,
      metadata: {
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        model: 'claude-code',
      },
    });

    console.log(response);
  }

  private async callModel(_prompt: string, traceId: string): Promise<string> {
    // TODO: Integrate with Google ADK for actual AI processing
    // This is a placeholder that will be replaced with actual implementation

    logger.info({ traceId }, 'Calling model (placeholder)');

    const apiKey = process.env.CLAUDE_API_KEY;
    if (!apiKey) {
      return `Welcome to Claude Code!\n\nTo get started, please set the CLAUDE_API_KEY environment variable in your .env file.\n\nYou can copy .env.example to .env and add your API key.\n\nAvailable commands:\n  claude [prompt]  - Send a prompt to Claude\n  claude           - Start interactive mode`;
    }

    return `Claude Code is configured and ready!\n\nProject: ${this.options.projectPath}\nPermission Mode: ${this.options.permissionMode}\n\nNote: Google ADK integration is not yet implemented. This is a placeholder response.`;
  }

  async startInteractive(): Promise<void> {
    console.log('Claude Code Interactive Mode');
    console.log('==============================');
    console.log('Type your request and press Enter. Press Ctrl+C to exit.\n');

    const readline = await import('readline');

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    const askQuestion = (): void => {
      rl.question('> ', async (input) => {
        if (input.trim()) {
          await this.processQuery(input.trim());
        }
        askQuestion();
      });
    };

    askQuestion();
  }

  getSessionId(): string {
    return this.sessionId;
  }

  getMessages(): Message[] {
    return this.messages;
  }
}
