import { z } from 'zod';
import { logger } from '../utils/logger.js';
import type { Tool, ToolContext, ToolResult } from '../Tool';

/**
 * WebSearchTool - Search the web using a search engine
 */
export class WebSearchTool implements Tool {
  public name = 'WebSearch';
  public description = 'Search the web for information using a search engine';

  public inputSchema = z.object({
    query: z.string().describe('Search query'),
    numResults: z.number().optional().default(10).describe('Number of results to return'),
  });

  async execute(
    input: z.infer<typeof this.inputSchema>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const { traceId } = context;

    logger.info({ query: input.query, traceId }, 'WebSearchTool execution started');

    try {
      // Use DuckDuckGo HTML API (no API key required)
      const encodedQuery = encodeURIComponent(input.query);
      const response = await fetch(
        `https://html.duckduckgo.com/html/?q=${encodedQuery}&b=${input.numResults}`,
        {
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; ClaudeCode/1.0)',
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Search failed with status: ${response.status}`);
      }

      const html = await response.text();

      // Parse results from HTML
      const results = this.parseResults(html, input.numResults);

      logger.info({ query: input.query, resultCount: results.length, traceId }, 'WebSearchTool completed');

      return {
        data: {
          query: input.query,
          results,
          total: results.length,
        },
        error: null,
        metadata: {
          duration_ms: Date.now() - startTime,
          trace_id: traceId,
        },
      };
    } catch (error) {
      logger.error({ query: input.query, error, traceId }, 'WebSearchTool failed');

      return {
        data: null,
        error: error instanceof Error ? error : new Error(String(error)),
        metadata: {
          duration_ms: Date.now() - startTime,
          trace_id: traceId,
        },
      };
    }
  }

  private parseResults(html: string, limit: number): Array<{ title: string; url: string; snippet: string }> {
    const results: Array<{ title: string; url: string; snippet: string }> = [];

    // Simple regex-based parsing for DuckDuckGo HTML results
    const resultRegex = /<a class="result__a" href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

    let match;
    let count = 0;
    while ((match = resultRegex.exec(html)) !== null && count < limit) {
      const url = match[1];
      // Filter out DuckDuckGo internal URLs
      if (url.startsWith('http')) {
        results.push({
          title: this.stripHtml(match[2]),
          url,
          snippet: this.stripHtml(match[3]),
        });
        count++;
      }
    }

    return results;
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim();
  }
}
