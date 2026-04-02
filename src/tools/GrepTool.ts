import { z } from 'zod';
import { readFile, readdir, stat } from 'fs/promises';
import { join } from 'path';
import type { Tool, ToolContext, ToolResult } from '../Tool';
import { logger } from '../utils/logger';

/**
 * Search result from GrepTool
 */
export interface GrepMatch {
  file: string;
  line: number;
  content: string;
  lineContent: string;
}

/**
 * Searches for patterns in files.
 */
export class GrepTool implements Tool {
  public name = 'Grep';
  public description = 'Searches for patterns in files with context';

  public inputSchema = z.object({
    pattern: z.string().describe('Regex pattern to search for'),
    path: z.string().optional().describe('File or directory path to search in'),
    glob: z.string().optional().describe('Glob pattern to filter files'),
    ignoreCase: z.boolean().optional().default(true).describe('Case insensitive search'),
    contextLines: z.number().optional().default(0).describe('Number of context lines to include'),
    maxResults: z.number().optional().default(100).describe('Maximum number of results'),
    include: z.array(z.string()).optional().describe('File extensions to include'),
  });

  async execute(
    input: z.infer<typeof this.inputSchema>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const path = input.path ?? context.cwd ?? context.projectPath ?? process.cwd();

    try {
      const matches: GrepMatch[] = [];
      const regexFlags = (input.ignoreCase !== false ? 'i' : '') + 'g';
      const regex = new RegExp(input.pattern, regexFlags);

      // Determine files to search
      const files = await this.getFilesToSearch(path, input.glob, input.include);

      for (const file of files) {
        const fileMatches = await this.searchFile(file, regex, input.contextLines);
        matches.push(...fileMatches);

        if (matches.length >= (input.maxResults ?? 100)) {
          break;
        }
      }

      logger.info(
        {
          pattern: input.pattern,
          path,
          matchCount: matches.length,
          traceId: context.traceId,
        },
        'Grep search completed',
      );

      return {
        data: {
          matches,
          totalMatches: matches.length,
        },
        error: null,
        metadata: {
          duration_ms: Date.now() - startTime,
          trace_id: context.traceId,
        },
      };
    } catch (error) {
      logger.error({ pattern: input.pattern, path, error, traceId: context.traceId }, 'Grep search failed');

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
   * Get list of files to search
   */
  private async getFilesToSearch(
    path: string,
    _glob?: string,
    include?: string[],
  ): Promise<string[]> {
    const files: string[] = [];
    const extensions = include ?? ['ts', 'tsx', 'js', 'jsx', 'json', 'md', 'txt'];

    const statResult = await stat(path).catch(() => null);

    if (statResult?.isFile()) {
      return [path];
    }

    await this.walkForGrep(path, files, extensions);
    return files;
  }

  /**
   * Walk directory for grep (separate from glob to handle extensions)
   */
  private async walkForGrep(
    dir: string,
    files: string[],
    extensions: string[],
    depth = 0,
  ): Promise<void> {
    if (depth > 10) return; // Limit recursion depth

    try {
      const entries = await readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.isDirectory()) {
          // Skip common directories
          if (['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
            continue;
          }
          await this.walkForGrep(join(dir, entry.name), files, extensions, depth + 1);
        } else if (entry.isFile()) {
          const ext = entry.name.split('.').pop() ?? '';
          if (extensions.includes(ext)) {
            files.push(join(dir, entry.name));
          }
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  /**
   * Search a single file for pattern
   */
  private async searchFile(
    filePath: string,
    regex: RegExp,
    contextLines: number,
  ): Promise<GrepMatch[]> {
    const matches: GrepMatch[] = [];

    try {
      const content = await readFile(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        regex.lastIndex = 0; // Reset regex state

        if (regex.test(line)) {
          // Get context lines
          const startLine = Math.max(0, i - contextLines);
          const endLine = Math.min(lines.length - 1, i + contextLines);
          const contextContent = lines.slice(startLine, endLine + 1).join('\n');

          matches.push({
            file: filePath,
            line: i + 1,
            content: contextContent,
            lineContent: line.trim(),
          });
        }
      }
    } catch {
      // Skip files we can't read
    }

    return matches;
  }
}
