/**
 * Circuit breaker pattern for external dependencies
 */

import { logger } from './logger.js';

/**
 * Circuit breaker states
 */
export enum CircuitState {
  /** Normal operation, requests pass through */
  CLOSED = 'CLOSED',
  /** Failing, requests are rejected immediately */
  OPEN = 'OPEN',
  /** Testing if the service has recovered */
  HALF_OPEN = 'HALF_OPEN',
}

/**
 * Circuit breaker events for logging
 */
export enum CircuitEvent {
  /** Circuit opened due to failures */
  CIRCUIT_OPENED = 'CIRCUIT_OPENED',
  /** Circuit closed after recovery */
  CIRCUIT_CLOSED = 'CIRCUIT_CLOSED',
  /** Circuit moved to half-open state */
  CIRCUIT_HALF_OPEN = 'CIRCUIT_HALF_OPEN',
}

/**
 * Configuration options for circuit breaker
 */
export interface CircuitBreakerOptions {
  /** Number of failures before opening the circuit (default: 5) */
  failureThreshold?: number;
  /** Number of successes needed to close the circuit (default: 2) */
  successThreshold?: number;
  /** Time in ms to wait before attempting recovery (default: 30000) */
  timeoutMs?: number;
  /** Callback when circuit state changes */
  onStateChange?: (state: CircuitState, event: CircuitEvent) => void;
}

/**
 * Default circuit breaker options
 */
const DEFAULT_CIRCUIT_BREAKER_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  successThreshold: 2,
  timeoutMs: 30000,
  onStateChange: () => {},
};

/**
 * Circuit breaker for protecting against cascading failures
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker({ failureThreshold: 3, timeoutMs: 60000 });
 *
 * const result = await breaker.execute(async () => {
 *   return await externalServiceCall();
 * });
 * ```
 */
export class CircuitBreaker {
  private readonly options: Required<CircuitBreakerOptions>;
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime: number | null = null;
  private readonly name: string;

  /**
   * Create a new circuit breaker
   *
   * @param name - Identifier for this circuit breaker
   * @param options - Configuration options
   */
  constructor(name: string, options: CircuitBreakerOptions = {}) {
    this.name = name;
    this.options = {
      ...DEFAULT_CIRCUIT_BREAKER_OPTIONS,
      ...options,
    } as Required<CircuitBreakerOptions>;
  }

  /**
   * Get current circuit state
   */
  public getState(): CircuitState {
    this.checkTimeout();
    return this.state;
  }

  /**
   * Check if the circuit allows requests
   */
  public isAvailable(): boolean {
    this.checkTimeout();
    return this.state !== CircuitState.OPEN;
  }

  /**
   * Execute a function through the circuit breaker
   *
   * @param fn - The function to execute
   * @returns The result of the function
   * @throws Error if circuit is open or function fails
   */
  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (!this.isAvailable()) {
      throw new Error(
        `Circuit breaker [${this.name}] is OPEN, request rejected`,
      );
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Execute a function synchronously through the circuit breaker
   *
   * @param fn - The function to execute
   * @returns The result of the function
   * @throws Error if circuit is open or function fails
   */
  public executeSync<T>(fn: () => T): T {
    // Check if circuit is open
    if (!this.isAvailable()) {
      throw new Error(
        `Circuit breaker [${this.name}] is OPEN, request rejected`,
      );
    }

    try {
      const result = fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.options.successThreshold) {
        this.transitionToClosed();
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === CircuitState.HALF_OPEN) {
      // Any failure in half-open means go back to open
      this.transitionToOpen();
    } else if (this.failureCount >= this.options.failureThreshold) {
      this.transitionToOpen();
    }
  }

  /**
   * Transition to OPEN state
   */
  private transitionToOpen(): void {
    if (this.state !== CircuitState.OPEN) {
      this.state = CircuitState.OPEN;
      this.successCount = 0;
      logger.warn(
        { name: this.name, failures: this.failureCount },
        `Circuit breaker [${this.name}] opened`,
      );
      this.options.onStateChange(CircuitState.OPEN, CircuitEvent.CIRCUIT_OPENED);
    }
  }

  /**
   * Transition to CLOSED state
   */
  private transitionToClosed(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    logger.info(
      { name: this.name },
      `Circuit breaker [${this.name}] closed`,
    );
    this.options.onStateChange(
      CircuitState.CLOSED,
      CircuitEvent.CIRCUIT_CLOSED,
    );
  }

  /**
   * Check if timeout has elapsed and transition to half-open
   */
  private checkTimeout(): void {
    if (
      this.state === CircuitState.OPEN &&
      this.lastFailureTime &&
      Date.now() - this.lastFailureTime >= this.options.timeoutMs
    ) {
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
      logger.info(
        { name: this.name, timeoutMs: this.options.timeoutMs },
        `Circuit breaker [${this.name}] half-open after timeout`,
      );
      this.options.onStateChange(
        CircuitState.HALF_OPEN,
        CircuitEvent.CIRCUIT_HALF_OPEN,
      );
    }
  }

  /**
   * Manually reset the circuit breaker to closed state
   */
  public reset(): void {
    this.transitionToClosed();
  }

  /**
   * Get statistics about the circuit breaker
   */
  public getStats(): {
    name: string;
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number | null;
  } {
    this.checkTimeout();
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

/**
 * Circuit breaker registry for managing multiple circuit breakers
 */
export class CircuitBreakerRegistry {
  private readonly breakers: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create a circuit breaker
   */
  public get(name: string, options?: CircuitBreakerOptions): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker(name, options);
      this.breakers.set(name, breaker);
    }
    return breaker;
  }

  /**
   * Remove a circuit breaker from the registry
   */
  public remove(name: string): boolean {
    return this.breakers.delete(name);
  }

  /**
   * Get all circuit breaker stats
   */
  public getAllStats(): Array<{
    name: string;
    state: CircuitState;
    failureCount: number;
    successCount: number;
  }> {
    return Array.from(this.breakers.values()).map((breaker) =>
      breaker.getStats(),
    );
  }

  /**
   * Reset all circuit breakers
   */
  public resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

// Default registry instance
export const circuitBreakerRegistry = new CircuitBreakerRegistry();
