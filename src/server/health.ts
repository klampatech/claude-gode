/**
 * Health Check Endpoint
 * Returns service status and dependency health
 */

import { execSync } from 'child_process';
import { accessSync, constants } from 'fs';
import { logger } from '../utils/logger.js';
import { metricsEndpointHandler } from './metrics.js';

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime_seconds: number;
  dependencies: Record<string, 'up' | 'down'>;
  version: string;
  session_count: number;
  memory_mb: number;
}

const startTime = Date.now();
let sessionCount = 0;

/**
 * Update session count (called by session management)
 */
export function updateSessionCount(count: number): void {
  sessionCount = count;
}

/**
 * Check if a dependency is available
 */
function checkDependency(_name: string, check: () => boolean): 'up' | 'down' {
  try {
    return check() ? 'up' : 'down';
  } catch {
    return 'down';
  }
}

/**
 * Get memory usage in MB
 */
function getMemoryUsage(): number {
  if (typeof process !== 'undefined' && process.memoryUsage) {
    return Math.round(process.memoryUsage().heapUsed / 1024 / 1024);
  }
  return 0;
}

/**
 * Check git availability
 */
function checkGit(): boolean {
  try {
    execSync('git --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check filesystem access
 */
function checkFilesystem(): boolean {
  try {
    accessSync(process.cwd(), constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check environment variables
 */
function checkEnvironment(): boolean {
  return process.env.CLAUDE_API_KEY !== undefined || process.env.GOOGLE_GENAI_API_KEY !== undefined;
}

/**
 * Get health status
 */
export function getHealthStatus(): HealthStatus {
  const uptimeSeconds = Math.floor((Date.now() - startTime) / 1000);
  const memoryMb = getMemoryUsage();

  const dependencies: Record<string, 'up' | 'down'> = {
    git: checkDependency('git', checkGit),
    filesystem: checkDependency('filesystem', checkFilesystem),
    environment: checkDependency('environment', checkEnvironment),
  };

  // Determine overall status
  let status: HealthStatus['status'] = 'healthy';
  const downCount = Object.values(dependencies).filter((d) => d === 'down').length;

  if (downCount > 0) {
    status = 'degraded';
  }
  if (downCount >= 2) {
    status = 'unhealthy';
  }

  return {
    status,
    uptime_seconds: uptimeSeconds,
    dependencies,
    version: process.env.npm_package_version ?? '1.0.0',
    session_count: sessionCount,
    memory_mb: memoryMb,
  };
}

/**
 * Express-style health endpoint handler
 */
export async function healthHandler(): Promise<{
  status: number;
  body: HealthStatus;
}> {
  const health = getHealthStatus();

  logger.debug(health, 'Health check requested');

  const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 200 : 503;

  return {
    status: statusCode,
    body: health,
  };
}

/**
 * Start the health server on specified port
 */
export function startHealthServer(port: number = 8080): void {
  // This is a simple HTTP server for health checks
  // In production, this would be integrated with the main server
  import('http')
    .then((http) => {
      const server = http.createServer((req, res) => {
        if (req.url === '/health') {
          healthHandler().then(({ status, body }) => {
            res.writeHead(status, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(body));
          });
        } else if (req.url === '/metrics') {
          metricsEndpointHandler().then(({ status, body }) => {
            res.writeHead(status, { 'Content-Type': 'text/plain' });
            res.end(body);
          });
        } else {
          res.writeHead(404);
          res.end('Not Found');
        }
      });

      server.listen(port, () => {
        logger.info({ port }, 'Health server started');
      });
    })
    .catch((err) => {
      logger.error({ err }, 'Failed to start health server');
    });
}
