import { z } from 'zod';
import { readFile } from 'fs/promises';
import type { Tool, ToolContext, ToolResult } from '../Tool.js';

/**
 * Reads file contents from the filesystem.
 */
export class FileReadTool implements Tool {
  public name = 'FileRead';
  public description = 'Reads the contents of a file from the filesystem';

  public inputSchema = z.object({
    path: z.string().describe('Absolute path to the file to read'),
  });

  async execute(
    input: z.infer<typeof this.inputSchema>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      const content = await readFile(input.path, 'utf-8');
      return {
        data: content,
        error: null,
        metadata: {
          duration_ms: Date.now() - startTime,
          trace_id: context.traceId,
        },
      };
    } catch (error) {
      return {
        data: null,
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: {
          duration_ms: Date.now() - startTime,
          trace_id: context.traceId,
        },
      };
    }
  }
}
