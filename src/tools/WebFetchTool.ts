import { z } from 'zod';
import { logger } from '../utils/logger.js';
import type { Tool, ToolContext, ToolResult } from '../Tool';

/**
 * WebFetchTool - Fetch content from a URL
 */
export class WebFetchTool implements Tool {
  public name = 'WebFetch';
  public description = 'Fetch content from a URL and return it as text';

  public inputSchema = z.object({
    url: z.string().url().describe('URL to fetch'),
    maxLength: z.number().optional().default(50000).describe('Maximum content length to fetch'),
    timeout: z.number().optional().default(30000).describe('Timeout in milliseconds'),
  });

  async execute(
    input: z.infer<typeof this.inputSchema>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const { traceId } = context;

    logger.info({ url: input.url, traceId }, 'WebFetchTool execution started');

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), input.timeout);

      const response = await fetch(input.url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; ClaudeCode/1.0)',
          'Accept': 'text/html,application/xhtml+xml,text/plain,*/*',
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Fetch failed with status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      let content = await response.text();

      // Truncate if needed
      if (content.length > input.maxLength) {
        content = content.substring(0, input.maxLength) + '\n... [truncated]';
      }

      // Determine content type
      let contentTypeCategory: 'html' | 'json' | 'text' | 'unknown' = 'unknown';
      if (contentType.includes('html')) {
        contentTypeCategory = 'html';
      } else if (contentType.includes('json')) {
        contentTypeCategory = 'json';
      } else if (contentType.includes('text')) {
        contentTypeCategory = 'text';
      }

      logger.info({ url: input.url, contentLength: content.length, traceId }, 'WebFetchTool completed');

      return {
        data: {
          url: input.url,
          content,
          contentType: contentTypeCategory,
          contentLength: content.length,
          status: response.status,
        },
        error: null,
        metadata: {
          duration_ms: Date.now() - startTime,
          trace_id: traceId,
        },
      };
    } catch (error) {
      logger.error({ url: input.url, error, traceId }, 'WebFetchTool failed');

      const errorMessage = error instanceof Error ? error.message : String(error);
      const isAborted = errorMessage.includes('aborted') || errorMessage.includes('timeout');

      return {
        data: null,
        error: new Error(isAborted ? `Fetch timed out after ${input.timeout}ms` : errorMessage),
        metadata: {
          duration_ms: Date.now() - startTime,
          trace_id: traceId,
        },
      };
    }
  }
}
