/**
 * Server - HTTP server for health and metrics endpoints
 */

import { logger } from '../utils/logger.js';
import {
  getHealthStatus,
  healthHandler,
  type HealthStatus,
  startHealthServer,
} from './health.js';
import {
  generateMetrics,
  metricsEndpointHandler,
  recordRequest,
  recordToolExecution,
  recordLatency,
  recordSessionCreated,
  recordSessionEnded,
  recordMessage,
  recordAgentSpawned,
  recordAgentCrashed,
  getMetricsSnapshot,
  resetMetrics,
} from './metrics.js';

export {
  // Health
  getHealthStatus,
  healthHandler,
  startHealthServer,
  type HealthStatus,
  // Metrics
  generateMetrics,
  metricsEndpointHandler,
  recordRequest,
  recordToolExecution,
  recordLatency,
  recordSessionCreated,
  recordSessionEnded,
  recordMessage,
  recordAgentSpawned,
  recordAgentCrashed,
  getMetricsSnapshot,
  resetMetrics,
};

/**
 * Server configuration
 */
export interface ServerConfig {
  port: number;
  host?: string;
  enableHealth?: boolean;
  enableMetrics?: boolean;
}

/**
 * Start the HTTP server
 */
export function startServer(config: ServerConfig): void {
  const port = config.port ?? 8080;
  const host = config.host ?? '0.0.0.0';

  if (config.enableHealth === false && config.enableMetrics === false) {
    logger.info('Health and metrics endpoints disabled');
    return;
  }

  import('http')
    .then((http) => {
      const server = http.createServer((req, res) => {
        const startTime = Date.now();

        // CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // Handle preflight
        if (req.method === 'OPTIONS') {
          res.writeHead(204);
          res.end();
          return;
        }

        try {
          if (req.url === '/health' && config.enableHealth !== false) {
            healthHandler().then(({ status, body }) => {
              res.writeHead(status, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(body));
              recordRequest(status < 400);
              recordLatency(Date.now() - startTime);
            });
          } else if (req.url === '/metrics' && config.enableMetrics !== false) {
            metricsEndpointHandler().then(({ status, body }) => {
              res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
              res.end(body);
              recordRequest(true);
              recordLatency(Date.now() - startTime);
            });
          } else {
            res.writeHead(404);
            res.end('Not Found');
            recordRequest(false);
          }
        } catch (error) {
          logger.error({ error }, 'Server error');
          res.writeHead(500);
          res.end('Internal Server Error');
          recordRequest(false);
        }
      });

      server.listen(port, host, () => {
        logger.info({ port, host }, 'Server started');
      });

      server.on('error', (err) => {
        logger.error({ err }, 'Server error');
      });
    })
    .catch((err) => {
      logger.error({ err }, 'Failed to start server');
    });
}
