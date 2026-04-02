import { logger } from './utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { AdkAgent } from './AdkAgent.js';

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

  private async callModel(prompt: string, traceId: string): Promise<string> {
    // Use Google ADK for AI processing
    logger.info({ traceId }, 'Calling model via Google ADK');

    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) {
      // Fallback to placeholder if no Google ADK API key
      logger.info({ traceId }, 'GOOGLE_GENAI_API_KEY not set, using fallback response');
      return `Welcome to Claude Code!\n\nTo get started with full AI capabilities, please set the GOOGLE_GENAI_API_KEY environment variable in your .env file.\n\nYou can copy .env.example to .env and add your Google AI API key.\n\nAvailable commands:\n  claude [prompt]  - Send a prompt to Claude\n  claude           - Start interactive mode`;
    }

    try {
      const adkAgent = new AdkAgent(
        {
          projectPath: this.options.projectPath,
          contextWindow: this.options.contextWindow,
          permissionMode: this.options.permissionMode,
        },
        { model: 'gemini-2.0-flash' },
      );

      const initialized = await adkAgent.initialize();
      if (!initialized) {
        return `Claude Code is configured but failed to initialize the AI agent. Please check your GOOGLE_GENAI_API_KEY.`;
      }

      return await adkAgent.processQuery(prompt);
    } catch (error) {
      const err = error as Error;
      logger.error({ err, traceId }, 'ADK call failed');
      return `I encountered an error: ${err.message}. Please check your GOOGLE_GENAI_API_KEY.`;
    }
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
