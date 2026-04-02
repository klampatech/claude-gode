import { z } from 'zod';
import { readdir } from 'fs/promises';
import { join, relative } from 'path';
import type { Tool, ToolContext, ToolResult } from '../Tool';
import { logger } from '../utils/logger';

/**
 * Finds files matching glob patterns.
 */
export class GlobTool implements Tool {
  public name = 'Glob';
  public description = 'Finds files matching glob patterns in a directory tree';

  public inputSchema = z.object({
    pattern: z.string().describe('Glob pattern to match (e.g., "**/*.ts", "src/**/*.js")'),
    cwd: z.string().optional().describe('Working directory to search in'),
    ignore: z.array(z.string()).optional().describe('Patterns to ignore'),
    maxDepth: z.number().optional().describe('Maximum directory depth to traverse'),
  });

  private _baseCwd = '';

  async execute(
    input: z.infer<typeof this.inputSchema>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const cwd = input.cwd ?? context.cwd;
    this._baseCwd = cwd;

    try {
      const matchedFiles: string[] = [];
      const ignorePatterns = input.ignore ?? ['node_modules', '.git', 'dist', 'build', '.next'];

      // Convert glob pattern to regex for matching
      const patternRegex = this.globToRegex(input.pattern);

      await this.walkDirectory(cwd, patternRegex, matchedFiles, ignorePatterns, input.maxDepth);

      logger.info(
        {
          pattern: input.pattern,
          cwd,
          matchCount: matchedFiles.length,
          traceId: context.traceId,
        },
        'Glob search completed',
      );

      return {
        data: {
          files: matchedFiles,
          count: matchedFiles.length,
        },
        error: null,
        metadata: {
          duration_ms: Date.now() - startTime,
          trace_id: context.traceId,
        },
      };
    } catch (error) {
      logger.error({ pattern: input.pattern, cwd, error, traceId: context.traceId }, 'Glob search failed');

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
   * Walk directory recursively matching files against pattern
   */
  private async walkDirectory(
    dir: string,
    pattern: RegExp,
    matches: string[],
    ignore: string[],
    maxDepth?: number,
    depth = 0,
  ): Promise<void> {
    const baseCwd = this._baseCwd;
    if (maxDepth !== undefined && depth > maxDepth) {
      return;
    }

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        // Skip ignored directories
        if (entry.isDirectory() && ignore.includes(entry.name)) {
          continue;
        }

        const fullPath = join(dir, entry.name);
        const relativePath = relative(baseCwd, fullPath);

        if (entry.isFile() && pattern.test(relativePath)) {
          matches.push(relativePath);
        } else if (entry.isDirectory()) {
          await this.walkDirectory(fullPath, pattern, matches, ignore, maxDepth, depth + 1);
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  /**
   * Convert a glob pattern to a regular expression
   */
  private globToRegex(glob: string): RegExp {
    let pattern = glob
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special regex chars
      .replace(/\*/g, '.*') // Convert * to .*
      .replace(/\?/g, '.'); // Convert ? to .

    // Handle ** (any directory depth)
    pattern = pattern.replace(/\.\*\.\*/g, '.*');

    return new RegExp(`^${pattern}$`);
  }
}
