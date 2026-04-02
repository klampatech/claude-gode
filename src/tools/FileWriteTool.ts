import { z } from 'zod';
import { writeFile, mkdir } from 'fs/promises';
import { dirname } from 'path';
import type { Tool, ToolContext, ToolResult } from '../Tool';
import { logger } from '../utils/logger';

/**
 * Writes content to a file on the filesystem.
 */
export class FileWriteTool implements Tool {
  public name = 'FileWrite';
  public description = 'Writes content to a file, creating directories as needed';

  public inputSchema = z.object({
    path: z.string().describe('Absolute path to the file to write'),
    content: z.string().describe('Content to write to the file'),
    createDirectories: z.boolean().optional().default(true).describe('Whether to create parent directories if they do not exist'),
  });

  async execute(
    input: z.infer<typeof this.inputSchema>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // Create parent directories if needed
      if (input.createDirectories) {
        const dir = dirname(input.path);
        await mkdir(dir, { recursive: true });
      }

      await writeFile(input.path, input.content, 'utf-8');

      logger.info(
        { path: input.path, contentLength: input.content.length, traceId: context.traceId },
        'File written successfully',
      );

      return {
        data: {
          path: input.path,
          bytesWritten: input.content.length,
        },
        error: null,
        metadata: {
          duration_ms: Date.now() - startTime,
          trace_id: context.traceId,
        },
      };
    } catch (error) {
      logger.error({ path: input.path, error, traceId: context.traceId }, 'File write failed');

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
