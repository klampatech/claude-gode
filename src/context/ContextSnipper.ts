/**
 * Context snipping utility for handling context overflow.
 * When context exceeds the model's input limit, this module provides
 * intelligent truncation strategies that preserve the most relevant information.
 */

import { logger } from '../utils/logger';

/**
 * Configuration for context snipping behavior
 */
export interface ContextSnipperConfig {
  /** Maximum tokens allowed in context (default: 100000 for large context models) */
  maxTokens: number;
  /** Approximate characters per token for estimation */
  charsPerToken: number;
  /** Priority sections to preserve (in order of priority) */
  prioritySections: string[];
}

/**
 * Default snipper configuration
 */
export const DEFAULT_SNIPPER_CONFIG: ContextSnipperConfig = {
  maxTokens: 100000,
  charsPerToken: 4, // Conservative estimate
  prioritySections: ['user_request', 'recent_history', 'git_state', 'memories', 'file_tree', 'env_vars'],
};

/**
 * Context section types for targeted snipping
 */
export type ContextSection = 'user_request' | 'history' | 'git_state' | 'file_tree' | 'env_vars' | 'memories' | 'lsp_symbols';

/**
 * A context chunk with metadata for intelligent snipping
 */
export interface ContextChunk {
  section: ContextSection;
  content: string;
  importance: number; // 0-100, higher = more important
  tokenEstimate: number;
}

/**
 * Result of snipping operation
 */
export interface SnipResult {
  originalLength: number;
  snippedLength: number;
  removedSections: ContextSection[];
  strategies: string[];
}

/**
 * Estimates token count from text
 */
function estimateTokens(text: string, charsPerToken: number = DEFAULT_SNIPPER_CONFIG.charsPerToken): number {
  return Math.ceil(text.length / charsPerToken);
}

/**
 * Splits context into chunks by section
 */
export function splitIntoChunks(context: Record<string, unknown>): ContextChunk[] {
  const chunks: ContextChunk[] = [];

  // User Request - highest priority
  if (context.userRequest) {
    chunks.push({
      section: 'user_request',
      content: String(context.userRequest),
      importance: 100,
      tokenEstimate: estimateTokens(String(context.userRequest)),
    });
  }

  // Git State
  if (context.gitState) {
    chunks.push({
      section: 'git_state',
      content: String(context.gitState),
      importance: 80,
      tokenEstimate: estimateTokens(String(context.gitState)),
    });
  }

  // Recent History
  if (context.history) {
    const history = String(context.history);
    chunks.push({
      section: 'history',
      content: history,
      importance: 70,
      tokenEstimate: estimateTokens(history),
    });
  }

  // Memories
  if (context.memories) {
    chunks.push({
      section: 'memories',
      content: String(context.memories),
      importance: 60,
      tokenEstimate: estimateTokens(String(context.memories)),
    });
  }

  // File Tree - can be very large
  if (context.fileTree) {
    const fileTree = String(context.fileTree);
    chunks.push({
      section: 'file_tree',
      content: fileTree,
      importance: 50,
      tokenEstimate: estimateTokens(fileTree),
    });
  }

  // Environment Variables - typically small
  if (context.envVars) {
    chunks.push({
      section: 'env_vars',
      content: String(context.envVars),
      importance: 40,
      tokenEstimate: estimateTokens(String(context.envVars)),
    });
  }

  // LSP Symbols - can be large
  if (context.lspSymbols) {
    const symbols = String(context.lspSymbols);
    chunks.push({
      section: 'lsp_symbols',
      content: symbols,
      importance: 30,
      tokenEstimate: estimateTokens(symbols),
    });
  }

  return chunks;
}

/**
 * Snips context to fit within token limit while preserving important sections
 */
export function snipContext(
  context: Record<string, unknown>,
  config: Partial<ContextSnipperConfig> = {}
): { context: Record<string, unknown>; result: SnipResult } {
  const cfg = { ...DEFAULT_SNIPPER_CONFIG, ...config };
  const chunks = splitIntoChunks(context);
  const maxChars = cfg.maxTokens * cfg.charsPerToken;

  // Calculate total current size
  const totalChars = chunks.reduce((sum, chunk) => sum + chunk.content.length, 0);

  // If under limit, return as-is
  if (totalChars <= maxChars) {
    return {
      context,
      result: {
        originalLength: totalChars,
        snippedLength: totalChars,
        removedSections: [],
        strategies: ['none'],
      },
    };
  }

  const removedSections: ContextSection[] = [];
  const strategies: string[] = [];
  const resultContext: Record<string, unknown> = { ...context };

  // Sort chunks by importance (descending)
  const sortedChunks = [...chunks].sort((a, b) => b.importance - a.importance);

  // Strategy 1: Remove low-priority sections entirely
  for (const chunk of sortedChunks) {
    if (chunk.importance < 40) {
      const sectionKey = mapSectionToKey(chunk.section);
      if (sectionKey && resultContext[sectionKey] !== undefined) {
        delete resultContext[sectionKey];
        removedSections.push(chunk.section);
        strategies.push(`removed_low_importance:${chunk.section}`);
      }
    }
  }

  // Recalculate after removals
  let newTotal = Object.values(resultContext).reduce((sum, val) => sum + String(val).length, 0);

  // Strategy 2: Truncate large sections proportionally
  if (newTotal > maxChars) {
    const largeChunks = sortedChunks.filter(c => c.content.length > maxChars / 10);
    for (const chunk of largeChunks) {
      const sectionKey = mapSectionToKey(chunk.section);
      if (sectionKey && resultContext[sectionKey]) {
        const original = String(resultContext[sectionKey]);
        // Keep 50% of large sections
        const truncated = original.slice(0, Math.floor(original.length * 0.5));
        resultContext[sectionKey] = truncated + '\n[... truncated for context limit ...]';
        strategies.push(`truncated:${chunk.section}_50%`);
        newTotal = Object.values(resultContext).reduce((sum, val) => sum + String(val).length, 0);
      }
    }
  }

  // Strategy 3: Final hard truncate if still over limit
  if (newTotal > maxChars) {
    let currentTotal = Object.entries(resultContext).reduce(
      (sum, [_, val]) => sum + String(val).length,
      0
    );

    for (const [key, value] of Object.entries(resultContext)) {
      if (currentTotal <= maxChars * 0.9) break;

      const str = String(value);
      const overage = currentTotal - Math.floor(maxChars * 0.9);
      if (overage > 0 && str.length > overage) {
        resultContext[key] = str.slice(0, -overage) + '\n[... context truncated ...]';
        currentTotal = Object.entries(resultContext).reduce(
          (sum, [_, val]) => sum + String(val).length,
          0
        );
        strategies.push(`hard_truncate:${key}`);
      }
    }
  }

  const finalLength = Object.values(resultContext).reduce((sum, val) => sum + String(val).length, 0);

  logger.debug(
    {
      originalLength: totalChars,
      finalLength,
      removedSections,
      strategies,
    },
    'Context snipped for overflow'
  );

  return {
    context: resultContext,
    result: {
      originalLength: totalChars,
      snippedLength: finalLength,
      removedSections,
      strategies: [...new Set(strategies)],
    },
  };
}

/**
 * Maps context section to key in the context object
 */
function mapSectionToKey(section: ContextSection): string | null {
  const mapping: Record<ContextSection, string> = {
    user_request: 'userRequest',
    history: 'history',
    git_state: 'gitState',
    file_tree: 'fileTree',
    env_vars: 'envVars',
    memories: 'memories',
    lsp_symbols: 'lspSymbols',
  };
  return mapping[section] || null;
}

/**
 * Builds a snipped context string for model input
 */
export function buildSnippedPrompt(context: Record<string, unknown>, userRequest: string): string {
  const { context: snippedContext } = snipContext(context);

  const parts: string[] = [];

  // User Request first
  parts.push(`## User Request\n${userRequest}\n`);

  // Git State
  if (snippedContext.gitState) {
    parts.push(`## Git State\n\`\`\`\n${snippedContext.gitState}\n\`\`\`\n`);
  }

  // File Tree (truncated)
  if (snippedContext.fileTree) {
    parts.push(`## File Tree\n\`\`\`\n${snippedContext.fileTree}\n\`\`\`\n`);
  }

  // Environment Variables
  if (snippedContext.envVars) {
    parts.push(`## Environment Variables\n\`\`\`\n${snippedContext.envVars}\n\`\`\`\n`);
  }

  // Memories
  if (snippedContext.memories) {
    parts.push(`## Relevant Memories\n\`\`\`\n${snippedContext.memories}\n\`\`\`\n`);
  }

  // History (truncated to recent)
  if (snippedContext.history) {
    parts.push(`## Conversation History\n\`\`\`\n${snippedContext.history}\n\`\`\`\n`);
  }

  return parts.join('\n');
}
