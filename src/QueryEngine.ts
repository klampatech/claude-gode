import { logger } from './utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { AdkAgent } from './AdkAgent.js';
import { MemoryStorage } from './memdir/MemoryStorage.js';
import { EnvParser } from './context/EnvParser.js';
import { buildSnippedPrompt } from './context/ContextSnipper.js';

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
  /** Optional session ID to restore from previous session */
  restoreSessionId?: string;
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
  private memoryStorage: MemoryStorage | null = null;
  private envParser: EnvParser;

  constructor(options: QueryEngineOptions) {
    this.options = options;
    this.envParser = new EnvParser(options.projectPath);
    this.sessionId = options.restoreSessionId ?? uuidv4();
    logger.info({ sessionId: this.sessionId, restored: !!options.restoreSessionId }, 'QueryEngine initialized');
  }

  /**
   * Initialize memory storage for session persistence
   */
  async initialize(): Promise<void> {
    this.memoryStorage = new MemoryStorage(this.options.projectPath);
    await this.memoryStorage.initialize();

    // Try to restore previous session if requested
    if (this.options.restoreSessionId) {
      const restored = await this.restoreSession(this.options.restoreSessionId);
      if (restored) {
        logger.info({ sessionId: this.sessionId }, 'Session restored successfully');
      } else {
        logger.warn({ sessionId: this.options.restoreSessionId }, 'Failed to restore session, starting fresh');
        this.sessionId = uuidv4();
      }
    } else {
      // Try to load the most recent session if exists
      const sessions = await this.memoryStorage.listSessions();
      if (sessions.length > 0) {
        // For now, we start fresh but could restore previous session
        logger.info({ sessionId: this.sessionId }, 'Starting new session (previous sessions available)');
      }
    }

    // Save initial session state
    await this.persistSession();
  }

  /**
   * Persist current session state to disk
   */
  async persistSession(): Promise<void> {
    if (!this.memoryStorage) return;

    try {
      await this.memoryStorage.saveSession({
        sessionId: this.sessionId,
        projectPath: this.options.projectPath,
        messages: this.messages.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.metadata?.timestamp || new Date().toISOString(),
        })),
        contextWindow: this.options.contextWindow,
        permissionMode: this.options.permissionMode,
      });
      logger.debug({ sessionId: this.sessionId }, 'Session persisted');
    } catch (error) {
      logger.warn({ err: error }, 'Failed to persist session');
    }
  }

  /**
   * Trim messages to fit within context window
   * Keeps recent messages and oldest messages as anchors
   */
  private trimMessages(): void {
    const maxMessages = this.options.contextWindow;
    if (this.messages.length <= maxMessages) return;

    // Keep: first 2 messages, last (maxMessages - 2) messages
    const keepCount = maxMessages - 2;
    const oldest = this.messages.slice(0, 2);
    const recent = this.messages.slice(-keepCount);

    this.messages = [...oldest, ...recent];
    logger.debug({ messageCount: this.messages.length }, 'Context window trimmed');
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

    // Load environment variables for context
    try {
      context.envVars = await this.envParser.getFormattedForContext();
    } catch (error) {
      logger.debug({ err: error }, 'Failed to parse env files');
      context.envVars = 'No environment variables found';
    }

    // Load relevant memories
    if (this.memoryStorage) {
      const memories = await this.memoryStorage.loadMemories({
        type: 'project',
        limit: 5,
      });
      if (memories.length > 0) {
        context.memories = memories.map(m => m.content).join('\n\n');
      }
    }

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
    // Apply context snipping to handle overflow
    const maxTokens = this.options.contextWindow || 100000;
    const contextObj = {
      userRequest: userInput,
      history: this.messages.map(m =>
        `${m.role}: ${m.content.substring(0, 200)}${m.content.length > 200 ? '...' : ''}`
      ).join('\n'),
      gitState: context.gitState,
      fileTree: context.fileTree,
      envVars: context.envVars,
      memories: context.memories,
      lspSymbols: context.lspSymbols,
    };

    // Use snipped prompt if context is large
    if (this.shouldSnip(contextObj, maxTokens)) {
      return buildSnippedPrompt(contextObj, userInput);
    }

    // Include conversation history in prompt
    const historySection = this.messages.length > 0
      ? `## Conversation History\n${this.messages.map(m =>
          `${m.role}: ${m.content.substring(0, 200)}${m.content.length > 200 ? '...' : ''}`
        ).join('\n')}\n\n`
      : '';

    const contextSection = `## Project Context\n\n### Git State\n\`\`\`\n${context.gitState || 'N/A'}\n\`\`\`\n\n### File Tree\n\`\`\`\n${context.fileTree || 'N/A'}\n\`\`\`\n\n### Environment Variables\n\`\`\`\n${context.envVars || 'N/A'}\n\`\`\`\n`;

    const memoriesSection = context.memories
      ? `## Relevant Memories\n\`\`\`\n${context.memories}\n\`\`\`\n`
      : '';

    return `${historySection}${contextSection}${memoriesSection}## User Request\n${userInput}`;
  }

  /**
   * Determine if context should be snipped based on estimated size
   */
  private shouldSnip(context: Record<string, unknown>, maxTokens: number): boolean {
    const charsPerToken = 4;
    const totalChars = Object.values(context).reduce(
      (sum: number, val) => sum + String(val || '').length,
      0
    );
    const estimatedTokens = Math.ceil(totalChars / charsPerToken);
    // Snip if we're at 80% of limit
    return estimatedTokens > maxTokens * 0.8;
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

    // Trim to context window before sending to model
    this.trimMessages();

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

    // Persist after each operation
    await this.persistSession();

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
    // Initialize memory storage first
    await this.initialize();

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

  /**
   * Restore session from a previous session ID
   */
  async restoreSession(previousSessionId: string): Promise<boolean> {
    if (!this.memoryStorage) {
      await this.initialize();
    }

    const session = await this.memoryStorage!.loadSession(previousSessionId);
    if (session) {
      this.sessionId = session.sessionId;
      this.messages = session.messages.map(m => ({
        role: m.role,
        content: m.content,
        metadata: {
          timestamp: m.timestamp,
          sessionId: this.sessionId,
          model: 'claude-code',
        },
      }));
      logger.info({ sessionId: this.sessionId }, 'Session restored');
      return true;
    }

    return false;
  }
}