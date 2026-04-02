import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './utils/logger';
import type { Tool, ToolContext, ToolResult } from './Tool';

// Default timeout for tool execution (30 seconds)
const DEFAULT_TOOL_TIMEOUT_MS = 30000;

/**
 * Configuration for tool execution
 */
export interface ToolExecutorConfig {
  /** Global timeout for all tool executions in milliseconds */
  globalTimeoutMs?: number;
  /** Maximum number of parallel tool executions */
  maxParallel?: number;
  /** Enable tool result caching */
  enableCache?: boolean;
}

/**
 * Result from executing a tool
 */
export interface ToolExecutionResult {
  toolName: string;
  result: ToolResult;
}

/**
 * Tool execution engine with timeout handling and parallel execution support.
 * Manages tool lifecycle, validation, execution, and result aggregation.
 */
export class ToolExecutor {
  private tools: Map<string, Tool> = new Map();
  private config: Required<ToolExecutorConfig>;
  private cache: Map<string, ToolResult> = new Map();

  constructor(config: ToolExecutorConfig = {}) {
    this.config = {
      globalTimeoutMs: config.globalTimeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
      maxParallel: config.maxParallel ?? 5,
      enableCache: config.enableCache ?? false,
    };
    logger.info({ config: this.config }, 'ToolExecutor initialized');
  }

  /**
   * Register a tool with the executor
   */
  registerTool(tool: Tool): void {
    if (this.tools.has(tool.name)) {
      logger.warn({ toolName: tool.name }, 'Tool already registered, overwriting');
    }
    this.tools.set(tool.name, tool);
    logger.debug({ toolName: tool.name }, 'Tool registered');
  }

  /**
   * Get a registered tool by name
   */
  getTool(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all registered tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Execute a single tool with validation and timeout handling
   */
  async executeTool(
    toolName: string,
    input: unknown,
    context: ToolContext,
    timeoutMs?: number,
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      const error = new Error(`Tool not found: ${toolName}`);
      logger.error({ toolName, traceId: context.traceId }, 'Tool execution failed');
      return {
        toolName,
        result: {
          data: null,
          error,
          metadata: {
            duration_ms: 0,
            trace_id: context.traceId,
          },
        },
      };
    }

    // Validate input against schema
    const validationResult = this.validateInput(tool.inputSchema, input);
    if (!validationResult.success) {
      const error = new Error(`Invalid input for ${toolName}: ${validationResult.error}`);
      logger.warn({ toolName, error: validationResult.error, traceId: context.traceId }, 'Tool input validation failed');
      return {
        toolName,
        result: {
          data: null,
          error,
          metadata: {
            duration_ms: 0,
            trace_id: context.traceId,
          },
        },
      };
    }

    // Check cache if enabled
    if (this.config.enableCache) {
      const cacheKey = this.getCacheKey(toolName, input);
      const cached = this.cache.get(cacheKey);
      if (cached) {
        logger.debug({ toolName, traceId: context.traceId }, 'Returning cached result');
        return { toolName, result: cached };
      }
    }

    // Execute with timeout
    const effectiveTimeout = timeoutMs ?? this.config.globalTimeoutMs;
    const result = await this.executeWithTimeout(tool, validationResult.data, context, effectiveTimeout);

    // Cache result if enabled
    if (this.config.enableCache && result.error === null) {
      const cacheKey = this.getCacheKey(toolName, input);
      this.cache.set(cacheKey, result);
    }

    logger.info(
      {
        toolName,
        durationMs: result.metadata.duration_ms,
        traceId: context.traceId,
        hasError: result.error !== null,
      },
      'Tool execution completed',
    );

    return { toolName, result };
  }

  /**
   * Execute multiple tools in parallel
   */
  async executeParallel(
    executions: Array<{ toolName: string; input: unknown; timeoutMs?: number }>,
    context: ToolContext,
  ): Promise<ToolExecutionResult[]> {
    const limitedExecutions = executions.slice(0, this.config.maxParallel);
    const promises = limitedExecutions.map((exec) =>
      this.executeTool(exec.toolName, exec.input, context, exec.timeoutMs),
    );

    const results = await Promise.all(promises);
    return results;
  }

  /**
   * Execute multiple tools sequentially (for dependent tools)
   */
  async executeSequential(
    executions: Array<{ toolName: string; input: unknown; timeoutMs?: number }>,
    context: ToolContext,
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];

    for (const exec of executions) {
      // Pass results from previous tool to context for dependent tools
      if (results.length > 0) {
        context = {
          ...context,
          previousResults: results.map((r) => ({ toolName: r.toolName, result: r.result })),
        };
      }

      const result = await this.executeTool(exec.toolName, exec.input, context, exec.timeoutMs);
      results.push(result);

      // Stop if a tool fails and is critical
      if (result.result.error !== null) {
        logger.warn(
          { toolName: exec.toolName, error: result.result.error.message },
          'Sequential execution stopped due to error',
        );
        break;
      }
    }

    return results;
  }

  /**
   * Clear the tool result cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Tool cache cleared');
  }

  /**
   * Validate input against a Zod schema
   */
  private validateInput(
    schema: z.ZodType<unknown>,
    input: unknown,
  ): { success: true; data: unknown } | { success: false; error: string } {
    try {
      const data = schema.parse(input);
      return { success: true, data };
    } catch (err) {
      if (err instanceof z.ZodError) {
        const errors = err.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
        return { success: false, error: errors };
      }
      return { success: false, error: String(err) };
    }
  }

  /**
   * Execute a tool with timeout handling
   */
  private async executeWithTimeout(
    tool: Tool,
    input: unknown,
    context: ToolContext,
    timeoutMs: number,
  ): Promise<ToolResult> {
    return new Promise<ToolResult>((resolve) => {
      const timeoutId = setTimeout(() => {
        const error = new Error(`Tool execution timed out after ${timeoutMs}ms`);
        logger.error({ toolName: tool.name, timeoutMs, traceId: context.traceId }, 'Tool timeout');
        resolve({
          data: null,
          error,
          metadata: {
            duration_ms: timeoutMs,
            trace_id: context.traceId,
          },
        });
      }, timeoutMs);

      // Execute the tool
      tool
        .execute(input, context)
        .then((result) => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timeoutId);
          logger.error({ toolName: tool.name, error, traceId: context.traceId }, 'Tool execution error');
          resolve({
            data: null,
            error: error instanceof Error ? error : new Error(String(error)),
            metadata: {
              duration_ms: timeoutMs,
              trace_id: context.traceId,
            },
          });
        });
    });
  }

  /**
   * Generate a cache key for tool execution
   */
  private getCacheKey(toolName: string, input: unknown): string {
    return `${toolName}:${JSON.stringify(input)}`;
  }
}

/**
 * Create a default tool context for execution
 */
export function createToolContext(options: {
  cwd: string;
  gitState?: string;
  env?: Record<string, string>;
  sessionId?: string;
  traceId?: string;
}): ToolContext {
  return {
    cwd: options.cwd,
    gitState: options.gitState ?? '',
    env: options.env ?? {},
    sessionId: options.sessionId ?? uuidv4(),
    traceId: options.traceId ?? uuidv4(),
  };
}
