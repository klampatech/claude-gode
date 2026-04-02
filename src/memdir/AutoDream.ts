/**
 * autoDream - Background memory consolidation system.
 * Runs as a forked agent after configured interval to extract key facts
 * from recent sessions and store them as semantic memories.
 */

import { logger } from '../utils/logger.js';
import { createLogContext } from '../utils/logger.js';
import { MemoryStorage, ExtractedFact } from '../memdir/MemoryStorage.js';
import { readFile } from 'fs/promises';
import { join } from 'path';

export interface DreamConfig {
  /** Hours after which autoDream triggers (default: 24) */
  triggerAfterHours: number;
  /** Number of sessions after which autoDream triggers (default: 10) */
  triggerAfterSessions: number;
  /** Maximum facts to extract per run */
  maxFactsPerRun: number;
  /** Enable/disable autoDream */
  enabled: boolean;
}

const DEFAULT_CONFIG: DreamConfig = {
  triggerAfterHours: 24,
  triggerAfterSessions: 10,
  maxFactsPerRun: 50,
  enabled: true,
};

/**
 * autoDream - Background memory consolidation.
 * Extracts key facts from recent sessions and stores them as semantic memories.
 */
export class AutoDream {
  private config: DreamConfig;
  private memoryStorage: MemoryStorage;
  private basePath: string;
  private timer: NodeJS.Timeout | null = null;
  private lastRun: Date | null = null;

  constructor(basePath: string, config: Partial<DreamConfig> = {}) {
    this.basePath = basePath;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.memoryStorage = new MemoryStorage(basePath);
  }

  /**
   * Initialize autoDream and start the background timer.
   */
  async initialize(): Promise<void> {
    await this.memoryStorage.initialize();
    logger.info({ basePath: this.basePath, config: this.config }, 'AutoDream initialized');

    if (this.config.enabled) {
      this.startTimer();
    }
  }

  /**
   * Start the autoDream timer.
   */
  private startTimer(): void {
    // Run every hour to check if conditions are met
    const checkInterval = 60 * 60 * 1000; // 1 hour
    this.timer = setInterval(() => {
      this.checkAndRun().catch((error) => {
        logger.error({ error }, 'AutoDream check failed');
      });
    }, checkInterval);

    logger.info({ intervalMs: checkInterval }, 'AutoDream timer started');
  }

  /**
   * Stop autoDream timer.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('AutoDream timer stopped');
    }
  }

  /**
   * Check if conditions are met and run if so.
   */
  private async checkAndRun(): Promise<void> {
    createLogContext(undefined, this.basePath);
    const now = new Date();

    // Check time-based trigger
    if (this.lastRun) {
      const hoursSinceLastRun = (now.getTime() - this.lastRun.getTime()) / (1000 * 60 * 60);
      if (hoursSinceLastRun < this.config.triggerAfterHours) {
        logger.debug({ hoursSinceLastRun, triggerAfterHours: this.config.triggerAfterHours }, 'Not time for autoDream yet');
        return;
      }
    }

    // Check session-count trigger
    const sessions = await this.memoryStorage.listSessions();
    if (sessions.length < this.config.triggerAfterSessions) {
      logger.debug({ sessionCount: sessions.length, triggerAfterSessions: this.config.triggerAfterSessions }, 'Not enough sessions for autoDream yet');
      return;
    }

    // Run autoDream
    logger.info({ sessionCount: sessions.length }, 'AutoDream conditions met, running consolidation');
    await this.run();
  }

  /**
   * Run the memory consolidation process.
   */
  async run(): Promise<void> {
    const ctx = createLogContext(undefined, this.basePath);
    logger.info(ctx, 'Starting autoDream consolidation');

    try {
      // Read recent session files
      const sessions = await this.memoryStorage.listSessions();
      const recentSessions = sessions.slice(0, this.config.triggerAfterSessions);

      // Extract facts from session messages
      const facts = await this.extractFacts(recentSessions);

      // Store extracted facts
      for (const fact of facts) {
        await this.memoryStorage.saveExtractedFact(fact);
      }

      this.lastRun = new Date();
      logger.info({ factsExtracted: facts.length }, 'AutoDream consolidation complete');
    } catch (error) {
      logger.error({ ...ctx, error }, 'AutoDream consolidation failed');
      throw error;
    }
  }

  /**
   * Extract facts from session data.
   */
  private async extractFacts(sessions: Array<{ sessionId: string; updatedAt: string }>): Promise<Omit<ExtractedFact, 'id' | 'createdAt'>[]> {
    const facts: Omit<ExtractedFact, 'id' | 'createdAt'>[] = [];

    for (const session of sessions) {
      try {
        const sessionPath = join(this.basePath, 'memdir', 'sessions', `${session.sessionId}.json`);
        const content = await readFile(sessionPath, 'utf-8');
        const sessionData = JSON.parse(content);

        // Extract key information from messages
        if (sessionData.messages) {
          for (const message of sessionData.messages) {
            // Extract tool usage patterns
            if (message.role === 'assistant' && message.content) {
              const toolMatches = message.content.match(/Used tool: (\w+)/g);
              if (toolMatches) {
                for (const match of toolMatches) {
                  const toolName = match.replace('Used tool: ', '');
                  facts.push({
                    fact: `Used ${toolName} tool`,
                    source: session.sessionId,
                    project: this.basePath,
                  });
                }
              }
            }

            // Extract file modifications
            if (message.content && message.content.includes('Modified:')) {
              const fileMatches = message.content.match(/Modified: ([^\n]+)/g);
              if (fileMatches) {
                for (const match of fileMatches) {
                  const filePath = match.replace('Modified: ', '');
                  facts.push({
                    fact: `Modified file: ${filePath}`,
                    source: session.sessionId,
                    project: this.basePath,
                  });
                }
              }
            }

            // Extract decisions/conclusions
            if (message.content && (message.content.includes('Decision:') || message.content.includes('Conclusion:'))) {
              const decisionMatch = message.content.match(/(?:Decision|Conclusion): ([^\n]+)/);
              if (decisionMatch) {
                facts.push({
                  fact: `Decision: ${decisionMatch[1]}`,
                  source: session.sessionId,
                  project: this.basePath,
                });
              }
            }
          }
        }
      } catch {
        // Skip sessions that can't be read
      }
    }

    // Limit to max facts
    return facts.slice(0, this.config.maxFactsPerRun);
  }

  /**
   * Manually trigger autoDream (for testing or on-demand).
   */
  async trigger(): Promise<number> {
    await this.run();
    const sessions = await this.memoryStorage.listSessions();
    return sessions.length;
  }

  /**
   * Get last run time.
   */
  getLastRun(): Date | null {
    return this.lastRun;
  }

  /**
   * Check if autoDream is enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled;
  }
}

/**
 * Create an AutoDream instance.
 */
export function createAutoDream(basePath: string, config?: Partial<DreamConfig>): AutoDream {
  return new AutoDream(basePath, config);
}