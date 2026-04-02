/**
 * Metrics Endpoint
 * Exposes Prometheus-format metrics
 */

import { logger } from '../utils/logger.js';

// Metrics counters
const metrics = {
  requests_total: 0,
  requests_success: 0,
  requests_error: 0,
  tool_executions_total: 0,
  tool_executions_success: 0,
  tool_executions_error: 0,
  sessions_created: 0,
  sessions_active: 0,
  messages_total: 0,
  agents_spawned: 0,
  agents_crashed: 0,
  uncaught_exceptions: 0,
  unhandled_rejections: 0,
};

// Latency tracking (in ms)
const latencies: number[] = [];
const MAX_LATENCY_SAMPLES = 1000;

/**
 * Record a request
 */
export function recordRequest(success: boolean): void {
  metrics.requests_total++;
  if (success) {
    metrics.requests_success++;
  } else {
    metrics.requests_error++;
  }
}

/**
 * Record a tool execution
 */
export function recordToolExecution(success: boolean): void {
  metrics.tool_executions_total++;
  if (success) {
    metrics.tool_executions_success++;
  } else {
    metrics.tool_executions_error++;
  }
}

/**
 * Record latency
 */
export function recordLatency(durationMs: number): void {
  latencies.push(durationMs);
  if (latencies.length > MAX_LATENCY_SAMPLES) {
    latencies.shift();
  }
}

/**
 * Record session events
 */
export function recordSessionCreated(): void {
  metrics.sessions_created++;
  metrics.sessions_active++;
}

export function recordSessionEnded(): void {
  metrics.sessions_active = Math.max(0, metrics.sessions_active - 1);
}

/**
 * Record message
 */
export function recordMessage(): void {
  metrics.messages_total++;
}

/**
 * Record agent events
 */
export function recordAgentSpawned(): void {
  metrics.agents_spawned++;
}

export function recordAgentCrashed(): void {
  metrics.agents_crashed++;
}

/**
 * Record uncaught exception
 */
export function recordUncaughtException(): void {
  metrics.uncaught_exceptions++;
}

/**
 * Record unhandled promise rejection
 */
export function recordUnhandledRejection(): void {
  metrics.unhandled_rejections++;
}

/**
 * Calculate percentile from sorted array
 */
function percentile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return Math.round(sorted[index] ?? 0);
}

/**
 * Generate Prometheus-format metrics
 */
export function generateMetrics(): string {
  const lines: string[] = [];

  // Request metrics
  lines.push(`# HELP claude_requests_total Total number of requests`);
  lines.push(`# TYPE claude_requests_total counter`);
  lines.push(`claude_requests_total ${metrics.requests_total}`);

  lines.push(`# HELP claude_requests_success Total number of successful requests`);
  lines.push(`# TYPE claude_requests_success counter`);
  lines.push(`claude_requests_success ${metrics.requests_success}`);

  lines.push(`# HELP claude_requests_error Total number of failed requests`);
  lines.push(`# TYPE claude_requests_error counter`);
  lines.push(`claude_requests_error ${metrics.requests_error}`);

  // Tool execution metrics
  lines.push(`# HELP claude_tool_executions_total Total number of tool executions`);
  lines.push(`# TYPE claude_tool_executions_total counter`);
  lines.push(`claude_tool_executions_total ${metrics.tool_executions_total}`);

  lines.push(`# HELP claude_tool_executions_success Total number of successful tool executions`);
  lines.push(`# TYPE claude_tool_executions_success counter`);
  lines.push(`claude_tool_executions_success ${metrics.tool_executions_success}`);

  lines.push(`# HELP claude_tool_executions_error Total number of failed tool executions`);
  lines.push(`# TYPE claude_tool_executions_error counter`);
  lines.push(`claude_tool_executions_error ${metrics.tool_executions_error}`);

  // Session metrics
  lines.push(`# HELP claude_sessions_created Total number of sessions created`);
  lines.push(`# TYPE claude_sessions_created counter`);
  lines.push(`claude_sessions_created ${metrics.sessions_created}`);

  lines.push(`# HELP claude_sessions_active Current number of active sessions`);
  lines.push(`# TYPE claude_sessions_active gauge`);
  lines.push(`claude_sessions_active ${metrics.sessions_active}`);

  // Message metrics
  lines.push(`# HELP claude_messages_total Total number of messages processed`);
  lines.push(`# TYPE claude_messages_total counter`);
  lines.push(`claude_messages_total ${metrics.messages_total}`);

  // Agent metrics
  lines.push(`# HELP claude_agents_spawned Total number of agents spawned`);
  lines.push(`# TYPE claude_agents_spawned counter`);
  lines.push(`claude_agents_spawned ${metrics.agents_spawned}`);

  lines.push(`# HELP claude_agents_crashed Total number of agents that crashed`);
  lines.push(`# TYPE claude_agents_crashed counter`);
  lines.push(`claude_agents_crashed ${metrics.agents_crashed}`);

  // Error handling metrics
  lines.push(`# HELP claude_uncaught_exceptions Total number of uncaught exceptions`);
  lines.push(`# TYPE claude_uncaught_exceptions counter`);
  lines.push(`claude_uncaught_exceptions ${metrics.uncaught_exceptions}`);

  lines.push(`# HELP claude_unhandled_rejections Total number of unhandled promise rejections`);
  lines.push(`# TYPE claude_unhandled_rejections counter`);
  lines.push(`claude_unhandled_rejections ${metrics.unhandled_rejections}`);

  // Latency metrics
  if (latencies.length > 0) {
    lines.push(`# HELP claude_latency_seconds Request latency in seconds`);
    lines.push(`# TYPE claude_latency_seconds summary`);
    lines.push(`claude_latency_seconds{quantile="0.5"} ${percentile(latencies, 50) / 1000}`);
    lines.push(`claude_latency_seconds{quantile="0.95"} ${percentile(latencies, 95) / 1000}`);
    lines.push(`claude_latency_seconds{quantile="0.99"} ${percentile(latencies, 99) / 1000}`);
    lines.push(`claude_latency_seconds_sum ${latencies.reduce((a, b) => a + b, 0) / 1000}`);
    lines.push(`claude_latency_seconds_count ${latencies.length}`);
  }

  // Calculate error rate
  if (metrics.requests_total > 0) {
    const errorRate = (metrics.requests_error / metrics.requests_total) * 100;
    lines.push(`# HELP claude_error_rate Error rate percentage`);
    lines.push(`# TYPE claude_error_rate gauge`);
    lines.push(`claude_error_rate ${errorRate.toFixed(2)}`);
  }

  lines.push('');
  return lines.join('\n');
}

/**
 * Express-style metrics endpoint handler
 */
export async function metricsEndpointHandler(): Promise<{
  status: number;
  body: string;
}> {
  const metricsBody = generateMetrics();

  logger.debug({ requestCount: metrics.requests_total }, 'Metrics requested');

  return {
    status: 200,
    body: metricsBody,
  };
}

/**
 * Get current metrics snapshot
 */
export function getMetricsSnapshot(): typeof metrics & { latencies_count: number } {
  return {
    ...metrics,
    latencies_count: latencies.length,
  };
}

/**
 * Reset all metrics (for testing)
 */
export function resetMetrics(): void {
  metrics.requests_total = 0;
  metrics.requests_success = 0;
  metrics.requests_error = 0;
  metrics.tool_executions_total = 0;
  metrics.tool_executions_success = 0;
  metrics.tool_executions_error = 0;
  metrics.sessions_created = 0;
  metrics.sessions_active = 0;
  metrics.messages_total = 0;
  metrics.agents_spawned = 0;
  metrics.agents_crashed = 0;
  latencies.length = 0;
}
