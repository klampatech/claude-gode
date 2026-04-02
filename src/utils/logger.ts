import pino from 'pino';
import { v4 as uuidv4 } from 'uuid';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

export interface LogContext {
  traceId: string;
  sessionId?: string;
  projectPath?: string;
  [key: string]: unknown;
}

export const logger = pino({
  level: LOG_LEVEL,
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  serializers: {
    error: pino.stdSerializers.err,
  },
});

export function createLogger(service: string): pino.Logger {
  return logger.child({ service });
}

export function createLogContext(
  sessionId?: string,
  projectPath?: string,
): LogContext {
  const ctx: LogContext = {
    traceId: uuidv4(),
  };
  if (sessionId) {
    ctx.sessionId = sessionId;
  }
  if (projectPath) {
    ctx.projectPath = projectPath;
  }
  return ctx;
}
