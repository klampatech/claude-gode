import { z } from 'zod';

export interface ToolContext {
  projectPath?: string;
  cwd?: string;
  gitState: string;
  env: Record<string, string>;
  sessionId?: string;
  traceId: string;
  previousResults?: Array<{ toolName: string; result: ToolResult }>;
}

export interface ToolMetadata {
  duration_ms: number;
  trace_id: string;
}

export interface ToolResult {
  data: unknown;
  error: Error | null;
  metadata: ToolMetadata;
}

/**
 * Base tool interface that all tools must implement.
 * Each tool has a name, description, and input schema for validation.
 */
export interface Tool {
  /** Unique name identifying this tool */
  name: string;

  /** Human-readable description of what this tool does */
  description: string;

  /** Zod schema for validating tool input before execution */
  inputSchema: z.ZodType<unknown>;

  /**
   * Execute the tool with the provided input and context.
   * @param input - Validated input matching the inputSchema
   * @param context - Execution context including cwd, git state, env vars
   * @returns ToolResult with data, error, and metadata
   */
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}

/**
 * Base class providing common tool functionality.
 * Tools should extend this class and implement the execute method.
 */
export abstract class BaseTool implements Tool {
  abstract name: string;
  abstract description: string;
  abstract inputSchema: z.ZodType<unknown>;

  abstract execute(input: unknown, context: ToolContext): Promise<ToolResult>;

  protected createResult(
    data: unknown,
    durationMs: number,
    traceId: string,
  ): ToolResult {
    return {
      data,
      error: null,
      metadata: {
        duration_ms: durationMs,
        trace_id: traceId,
      },
    };
  }

  protected createError(
    error: Error,
    durationMs: number,
    traceId: string,
  ): ToolResult {
    return {
      data: null,
      error,
      metadata: {
        duration_ms: durationMs,
        trace_id: traceId,
      },
    };
  }
}
