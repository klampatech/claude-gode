import { z } from 'zod';
import { readFile, writeFile } from 'fs/promises';
import type { Tool, ToolContext, ToolResult } from '../Tool';
import { logger } from '../utils/logger';

/**
 * Edits a file by replacing specific content.
 * Supports precise string replacement with optional regex.
 */
export class FileEditTool implements Tool {
  public name = 'FileEdit';
  public description = 'Edits a file by replacing specific content with new content';

  public inputSchema = z.object({
    path: z.string().describe('Absolute path to the file to edit'),
    oldString: z.string().describe('The content to replace (string or regex pattern)'),
    newString: z.string().describe('The replacement content'),
    replaceAll: z.boolean().optional().default(false).describe('Whether to replace all occurrences'),
  });

  async execute(
    input: z.infer<typeof this.inputSchema>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();

    try {
      // Read the file
      const content = await readFile(input.path, 'utf-8');

      let newContent: string;
      let replacementCount: number;

      if (input.replaceAll) {
        // Replace all occurrences
        const regex = new RegExp(this.escapeRegex(input.oldString), 'g');
        newContent = content.replace(regex, input.newString);
        replacementCount = (content.match(regex) || []).length;
      } else {
        // Replace first occurrence only
        const regex = new RegExp(this.escapeRegex(input.oldString));
        const match = content.match(regex);

        if (!match) {
          return {
            data: null,
            error: new Error(`Pattern not found in file: ${input.oldString}`),
            metadata: {
              duration_ms: Date.now() - startTime,
              trace_id: context.traceId,
            },
          };
        }

        newContent = content.replace(regex, input.newString);
        replacementCount = 1;
      }

      // Write the file
      await writeFile(input.path, newContent, 'utf-8');

      logger.info(
        {
          path: input.path,
          replacementCount,
          traceId: context.traceId,
        },
        'File edited successfully',
      );

      return {
        data: {
          path: input.path,
          replacements: replacementCount,
        },
        error: null,
        metadata: {
          duration_ms: Date.now() - startTime,
          trace_id: context.traceId,
        },
      };
    } catch (error) {
      logger.error({ path: input.path, error, traceId: context.traceId }, 'File edit failed');

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

  /**
   * Escape special regex characters in a string
   */
  private escapeRegex(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
