/**
 * Google ADK Agent Integration
 * Provides AI-powered agent functionality using Google ADK
 */

import { LlmAgent, InMemoryRunner, FunctionTool } from '@google/adk';
import { z } from 'zod';
import { logger } from './utils/logger.js';
import { FileReadTool } from './tools/FileReadTool.js';
import { FileWriteTool } from './tools/FileWriteTool.js';
import { GlobTool } from './tools/GlobTool.js';
import { GrepTool } from './tools/GrepTool.js';
import { BashTool, type PermissionMode } from './tools/BashTool.js';
import { WebSearchTool } from './tools/WebSearchTool.js';
import { WebFetchTool } from './tools/WebFetchTool.js';

interface AdkAgentConfig {
  projectPath: string;
  contextWindow: number;
  permissionMode: PermissionMode;
}

interface AdkAgentOptions {
  model?: string;
}

// Re-export PermissionMode for external consumers
export type { PermissionMode } from './tools/BashTool.js';

/**
 * ADK-powered agent for Claude Code
 */
export class AdkAgent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private runner: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tools: any[] = [];
  private config: AdkAgentConfig;
  private initialized = false;

  constructor(config: AdkAgentConfig, options?: AdkAgentOptions) {
    this.config = config;

    // Create tool instances
    const projectPath = config.projectPath;
    const fileReadTool = new FileReadTool();
    const fileWriteTool = new FileWriteTool();
    const globTool = new GlobTool();
    const grepTool = new GrepTool();
    const bashTool = new BashTool({ permissionMode: config.permissionMode });
    const webSearchTool = new WebSearchTool();
    const webFetchTool = new WebFetchTool();

    // Create function tools using direct 'any' casting to bypass Zod version conflicts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const FT = FunctionTool as any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const zod = z as any;

    this.tools = [
      new FT({
        name: 'file_read',
        description: 'Read file contents from the filesystem',
        parameters: zod.object({
          path: zod.string().describe('Absolute path to file'),
        }),
        execute: async (args: { path: string }) => {
          const traceId = crypto.randomUUID();
          const result = await fileReadTool.execute(args, {
            projectPath,
            gitState: '',
            env: {},
            traceId,
          });
          return result.error ? { error: result.error.message } : result.data;
        },
      }),
      new FT({
        name: 'file_write',
        description: 'Write content to a file',
        parameters: zod.object({
          path: zod.string().describe('Absolute path to file'),
          content: zod.string().describe('Content to write'),
          createDirectories: zod.boolean().optional().default(true),
        }),
        execute: async (args: { path: string; content: string; createDirectories?: boolean }) => {
          const traceId = crypto.randomUUID();
          const fullArgs = { ...args, createDirectories: args.createDirectories ?? true };
          const result = await fileWriteTool.execute(fullArgs, {
            projectPath,
            gitState: '',
            env: {},
            traceId,
          });
          return result.error ? { error: result.error.message } : result.data;
        },
      }),
      new FT({
        name: 'glob',
        description: 'Find files matching a pattern',
        parameters: zod.object({
          pattern: zod.string().describe('Glob pattern'),
          path: zod.string().optional().describe('Directory to search'),
        }),
        execute: async (args: { pattern: string; path?: string }) => {
          const traceId = crypto.randomUUID();
          const result = await globTool.execute(args, {
            projectPath,
            gitState: '',
            env: {},
            traceId,
          });
          return result.error ? { error: result.error.message } : result.data;
        },
      }),
      new FT({
        name: 'grep',
        description: 'Search file contents',
        parameters: zod.object({
          pattern: zod.string().describe('Search pattern'),
          path: zod.string().optional().describe('Path to search'),
          ignoreCase: zod.boolean().optional().default(false),
          contextLines: zod.number().optional().default(0),
          maxResults: zod.number().optional().default(100),
        }),
        execute: async (args: { pattern: string; path?: string; ignoreCase?: boolean; contextLines?: number; maxResults?: number }) => {
          const traceId = crypto.randomUUID();
          const fullArgs = {
            ...args,
            ignoreCase: args.ignoreCase ?? false,
            contextLines: args.contextLines ?? 0,
            maxResults: args.maxResults ?? 100,
          };
          const result = await grepTool.execute(fullArgs, {
            projectPath,
            gitState: '',
            env: {},
            traceId,
          });
          return result.error ? { error: result.error.message } : result.data;
        },
      }),
      new FT({
        name: 'bash',
        description: 'Execute a shell command',
        parameters: zod.object({
          command: zod.string().describe('Shell command to execute'),
        }),
        execute: async (args: { command: string }) => {
          const traceId = crypto.randomUUID();
          const result = await bashTool.execute(args, {
            projectPath,
            gitState: '',
            env: {},
            traceId,
          });
          return result.error ? { error: result.error.message } : result.data;
        },
      }),
      new FT({
        name: 'web_search',
        description: 'Search the web',
        parameters: zod.object({
          query: zod.string().describe('Search query'),
          numResults: zod.number().optional().default(10),
        }),
        execute: async (args: { query: string; numResults?: number }) => {
          const traceId = crypto.randomUUID();
          const fullArgs = { ...args, numResults: args.numResults ?? 10 };
          const result = await webSearchTool.execute(fullArgs, {
            projectPath,
            gitState: '',
            env: {},
            traceId,
          });
          return result.error ? { error: result.error.message } : result.data;
        },
      }),
      new FT({
        name: 'web_fetch',
        description: 'Fetch a URL',
        parameters: zod.object({
          url: zod.string().describe('URL to fetch'),
          timeout: zod.number().optional().default(30000),
          maxLength: zod.number().optional().default(500000),
        }),
        execute: async (args: { url: string; timeout?: number; maxLength?: number }) => {
          const traceId = crypto.randomUUID();
          const fullArgs = { ...args, timeout: args.timeout ?? 30000, maxLength: args.maxLength ?? 500000 };
          const result = await webFetchTool.execute(fullArgs, {
            projectPath,
            gitState: '',
            env: {},
            traceId,
          });
          return result.error ? { error: result.error.message } : result.data;
        },
      }),
    ];

    // Create the root agent
    const rootAgent = new LlmAgent({
      name: 'claude_code_agent',
      model: options?.model ?? 'gemini-2.0-flash',
      description: 'A CLI coding assistant that helps with file operations, shell commands, and web searches',
      instruction: `You are Claude Code, a powerful CLI coding assistant.
You help developers by:
- Reading, writing, and editing files
- Running shell commands safely
- Searching the web for information

Always be helpful, precise, and clear in your responses.
When executing commands, explain what you're doing first.`,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: this.tools as any,
    });

    this.runner = new InMemoryRunner({ agent: rootAgent });
  }

  /**
   * Initialize the agent
   */
  async initialize(): Promise<boolean> {
    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey) {
      logger.warn('GOOGLE_GENAI_API_KEY not set, ADK agent will run in fallback mode');
      this.initialized = false;
      return false;
    }

    this.initialized = true;
    logger.info('ADK agent ready');
    return true;
  }

  /**
   * Process a user query through the ADK agent
   */
  async processQuery(userInput: string): Promise<string> {
    const apiKey = process.env.GOOGLE_GENAI_API_KEY;
    if (!apiKey || !this.initialized) {
      return `Claude Code - ADK Edition

To get started with full AI capabilities, please set GOOGLE_GENAI_API_KEY in your .env file.

Copy .env.example to .env and add your Google AI API key.

Usage:
  claude "your prompt"  - Send a prompt
  claude             - Interactive mode`;
    }

    try {
      const traceId = crypto.randomUUID();
      logger.info({ traceId, userInput }, 'Processing query via ADK');

      const events: string[] = [];
      for await (const event of this.runner.runAsync({
        userId: 'claude-code',
        sessionId: this.config.projectPath,
        newMessage: {
          role: 'user',
          parts: [{ text: userInput }],
        },
      })) {
        if (event.content?.parts?.[0]?.text) {
          events.push(event.content.parts[0].text);
        }
      }

      const response = events.join('');
      logger.info({ traceId, responseLength: response.length }, 'Query processed via ADK');
      return response || 'I processed your request but received no response.';
    } catch (error) {
      const err = error as Error;
      logger.error({ err: err }, 'ADK query processing failed');
      return `Error processing request: ${err.message}`;
    }
  }

  /**
   * Check if the agent is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Get the list of available tools
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getTools(): any[] {
    return this.tools;
  }
}