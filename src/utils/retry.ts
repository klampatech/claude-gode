/**
 * Retry utility with exponential backoff for transient failures
 */

import { logger } from './logger.js';

/**
 * Configuration options for retry behavior
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay in milliseconds (default: 1000) */
  initialDelayMs?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier?: number;
  /** Jitter factor to add randomness (default: 0.1) */
  jitterFactor?: number;
  /** List of error codes that should NOT be retried */
  nonRetryableErrors?: string[];
  /** Function to determine if an error is retryable */
  isRetryable?: (error: Error) => boolean;
}

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  jitterFactor: 0.1,
  nonRetryableErrors: ['VALIDATION_ERROR', 'AUTHENTICATION_ERROR', 'AUTHORIZATION_ERROR'],
  isRetryable: () => true,
};

/**
 * Applies exponential backoff with jitter to calculate the next delay
 */
function calculateDelay(
  attempt: number,
  options: Required<RetryOptions>,
): number {
  // Calculate exponential backoff: initialDelay * (multiplier ^ attempt)
  const exponentialDelay =
    options.initialDelayMs * Math.pow(options.backoffMultiplier, attempt);

  // Apply jitter to prevent thundering herd
  const jitter = exponentialDelay * options.jitterFactor * Math.random();

  // Cap at max delay
  const delay = Math.min(exponentialDelay + jitter, options.maxDelayMs);

  return Math.floor(delay);
}

/**
 * Retry options interface for function overloads
 */
export interface RetryOptionsInput {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  jitterFactor?: number;
  nonRetryableErrors?: string[];
  isRetryable?: (error: Error) => boolean;
}

/**
 * Retry a function with exponential backoff
 *
 * @param fn - The function to retry
 * @param options - Retry configuration options
 * @returns The result of the function
 *
 * @example
 * ```typescript
 * const result = await retry(async () => {
 *   return await fetchData();
 * }, { maxAttempts: 5, initialDelayMs: 500 });
 * ```
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptionsInput = {},
): Promise<T> {
  const opts: Required<RetryOptions> = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  } as Required<RetryOptions>;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if this error is retryable
      const isNonRetryable = opts.nonRetryableErrors.some((code) =>
        lastError!.message.includes(code),
      );

      const isRetryableResult =
        opts.isRetryable && !opts.isRetryable(lastError);

      if (isNonRetryable || isRetryableResult) {
        logger.debug(
          { error: lastError.message, attempt },
          'Non-retryable error, giving up',
        );
        throw lastError;
      }

      // Check if we have more attempts left
      if (attempt >= opts.maxAttempts - 1) {
        logger.warn(
          { error: lastError.message, attempts: opts.maxAttempts },
          'Max retry attempts reached',
        );
        throw lastError;
      }

      // Calculate and apply delay
      const delay = calculateDelay(attempt, opts);
      logger.info(
        { error: lastError.message, attempt: attempt + 1, delayMs: delay },
        'Retrying after delay',
      );

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Retry a function with exponential backoff and custom error handling
 *
 * @param fn - The function to retry
 * @param onRetry - Callback invoked before each retry (can modify options)
 * @param options - Retry configuration options
 * @returns The result of the function
 *
 * @example
 * ```typescript
 * const result = await retryWithCallback(
 *   async () => await fetchData(),
 *   (error, attempt) => {
 *     logger.warn({ error, attempt }, 'Retrying...');
 *   },
 *   { maxAttempts: 5 }
 * );
 * ```
 */
export async function retryWithCallback<T>(
  fn: () => Promise<T>,
  onRetry: (error: Error, attempt: number) => void | Promise<void>,
  options: RetryOptionsInput = {},
): Promise<T> {
  const opts: Required<RetryOptions> = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  } as Required<RetryOptions>;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Check if this error is retryable
      const isNonRetryable = opts.nonRetryableErrors.some((code) =>
        lastError!.message.includes(code),
      );

      const isRetryableResult =
        opts.isRetryable && !opts.isRetryable(lastError);

      if (isNonRetryable || isRetryableResult) {
        throw lastError;
      }

      // Invoke the callback
      await onRetry(lastError, attempt + 1);

      // Check if we have more attempts left
      if (attempt >= opts.maxAttempts - 1) {
        throw lastError;
      }

      // Calculate and apply delay
      const delay = calculateDelay(attempt, opts);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
