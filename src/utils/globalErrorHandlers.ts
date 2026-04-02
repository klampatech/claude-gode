/**
 * Global error handlers for uncaught exceptions and unhandled rejections
 */

import { logger } from './logger.js';
import { getMetricsSnapshot } from '../server/metrics.js';
import { recordUncaughtException, recordUnhandledRejection } from '../server/metrics.js';

/**
 * Global error handler configuration
 */
export interface GlobalErrorHandlerOptions {
  /** Whether to exit process on uncaught exception (default: true in production) */
  exitOnUncaughtException?: boolean;
  /** Whether to exit process on unhandled rejection (default: true in production) */
  exitOnUnhandledRejection?: boolean;
  /** Additional cleanup function to call before exit */
  cleanup?: () => Promise<void> | void;
}

/**
 * Setup global error handlers for the process
 *
 * @param options - Configuration options
 *
 * @example
 * ```typescript
 * setupGlobalErrorHandlers({
 *   exitOnUncaughtException: true,
 *   exitOnUnhandledRejection: true,
 *   cleanup: async () => {
 *     await db.disconnect();
 *   }
 * });
 * ```
 */
export function setupGlobalErrorHandlers(
  options: GlobalErrorHandlerOptions = {},
): void {
  const isProduction = process.env.NODE_ENV === 'production';
  const exitOnUncaughtException = options.exitOnUncaughtException ?? isProduction;
  const exitOnUnhandledRejection = options.exitOnUnhandledRejection ?? isProduction;

  // Handle uncaught exceptions
  process.on('uncaughtException', async (error: Error) => {
    const errorInfo = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };

    // Log with full context
    logger.error(
      { error: errorInfo, uptime: process.uptime() },
      'Uncaught exception',
    );

    // Record metric
    recordUncaughtException();

    // Log metrics snapshot for debugging
    try {
      const metrics = getMetricsSnapshot();
      logger.debug({ metrics }, 'Metrics snapshot at exception');
    } catch {
      // Ignore metrics errors
    }

    // Call cleanup if provided
    if (options.cleanup) {
      try {
        await options.cleanup();
      } catch (cleanupError) {
        logger.error(
          { err: cleanupError },
          'Error during cleanup',
        );
      }
    }

    // Exit based on configuration
    if (exitOnUncaughtException) {
      logger.error('Exiting due to uncaught exception');
      process.exit(1);
    }
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', async (reason: unknown, promise: Promise<unknown>) => {
    const reasonStr = reason instanceof Error
      ? { name: reason.name, message: reason.message, stack: reason.stack }
      : String(reason);

    // Log with full context
    logger.error(
      { reason: reasonStr, uptime: process.uptime() },
      'Unhandled promise rejection',
    );

    // Record metric
    recordUnhandledRejection();

    // Log metrics snapshot for debugging
    try {
      const metrics = getMetricsSnapshot();
      logger.debug({ metrics }, 'Metrics snapshot at rejection');
    } catch {
      // Ignore metrics errors
    }

    // Call cleanup if provided
    if (options.cleanup) {
      try {
        await options.cleanup();
      } catch (cleanupError) {
        logger.error(
          { err: cleanupError },
          'Error during cleanup',
        );
      }
    }

    // Exit based on configuration
    if (exitOnUnhandledRejection) {
      logger.error('Exiting due to unhandled rejection');
      process.exit(1);
    }
  });

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully');

    if (options.cleanup) {
      try {
        await options.cleanup();
      } catch (error) {
        logger.error({ err: error }, 'Error during SIGINT cleanup');
      }
    }

    process.exit(0);
  });

  // Handle SIGTERM (kill)
  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully');

    if (options.cleanup) {
      try {
        await options.cleanup();
      } catch (error) {
        logger.error({ err: error }, 'Error during SIGTERM cleanup');
      }
    }

    process.exit(0);
  });

  logger.info(
    { exitOnUncaughtException, exitOnUnhandledRejection },
    'Global error handlers registered',
  );
}

/**
 * Create a cleanup function for the QueryEngine
 */
export function createEngineCleanup(engine: { persistSession: () => Promise<void> }): () => Promise<void> {
  return async () => {
    try {
      await engine.persistSession();
      logger.info('Session state saved during shutdown');
    } catch (error) {
      logger.error({ err: error }, 'Failed to save session during shutdown');
    }
  };
}
