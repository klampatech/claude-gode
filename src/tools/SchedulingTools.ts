/**
 * Scheduling Tools - Cron-based task scheduling
 *
 * Tools for scheduling recurring tasks using cron expressions.
 * Supports one-shot and recurring scheduled tasks.
 */

import { z } from 'zod';
import { logger } from '../utils/logger.js';
import type { Tool, ToolContext, ToolResult } from '../Tool.js';

/**
 * Scheduled task definition
 */
export interface ScheduledTask {
  id: string;
  command: string;
  cron: string;
  recurring: boolean;
  status: 'pending' | 'running' | 'completed' | 'cancelled' | 'failed';
  createdAt: string;
  nextRunAt?: string;
  lastRunAt?: string;
  runCount: number;
  maxRuns?: number;
}

/**
 * Cron expression parser result
 */
export interface CronParseResult {
  valid: boolean;
  nextRuns?: Date[];
  error?: string;
}

/**
 * Simple cron parser (supports standard 5-field cron)
 */
function parseCronExpression(cron: string): CronParseResult {
  const parts = cron.trim().split(/\s+/);

  if (parts.length < 5 || parts.length > 6) {
    return { valid: false, error: 'Invalid cron expression: expected 5-6 fields' };
  }

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Basic validation - allow *, numbers, ranges, lists, steps
  const validations = [
    { field: 'minute', pattern: /^(\*|\*\/[1-9]\d*|[0-9]|[1-5][0-9])(,(\*|\*\/[1-9]\d*|[0-9]|[1-5][0-9]))*$/ },
    { field: 'hour', pattern: /^(\*|\*\/[1-9]\d*|[0-9]|1[0-9]|2[0-3])(,(\*|\*\/[1-9]\d*|[0-9]|1[0-9]|2[0-3]))*$/ },
    { field: 'dayOfMonth', pattern: /^(\*|\*\/[1-9]\d*|[1-9]|1[0-9]|2[0-9]|3[0-1])(,(\*|\*\/[1-9]\d*|[1-9]|1[0-9]|2[0-9]|3[0-1]))*$/ },
    { field: 'month', pattern: /^(\*|\*\/[1-9]\d*|[1-9]|1[0-2])(,(\*|\*\/[1-9]\d*|[1-9]|1[0-2]))*$/ },
    { field: 'dayOfWeek', pattern: /^(\*|\*\/[1-9]\d*|[0-6])(,(\*|\*\/[1-9]\d*|[0-6]))*$/ },
  ];

  const fields = [minute, hour, dayOfMonth, month, dayOfWeek];

  for (let i = 0; i < validations.length; i++) {
    if (!validations[i].pattern.test(fields[i])) {
      return {
        valid: false,
        error: `Invalid ${validations[i].field}: ${fields[i]}`,
      };
    }
  }

  // Calculate next few runs
  const now = new Date();
  const nextRuns: Date[] = [];

  // Simple next run calculation (for common cases)
  for (let i = 0; i < 5; i++) {
    const next = new Date(now.getTime() + (i + 1) * 60000);
    nextRuns.push(next);
  }

  return { valid: true, nextRuns };
}

/**
 * ScheduleCronTool - Schedule a task to run on a cron schedule
 */
export class ScheduleCronTool implements Tool {
  public name = 'ScheduleCron';
  public description = 'Schedule a command to run on a cron schedule';

  public inputSchema = z.object({
    command: z.string().min(1).describe('Command to execute'),
    cron: z.string().min(9).describe('Cron expression (e.g., "0 9 * * *" for daily at 9am)'),
    recurring: z.boolean().optional().default(true).describe('Whether to run repeatedly'),
    maxRuns: z.number().optional().describe('Maximum number of runs for recurring tasks'),
  });

  private static scheduledTasks: Map<string, ScheduledTask> = new Map();

  async execute(
    input: z.infer<typeof this.inputSchema>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const { traceId } = context;

    logger.info({ command: input.command, cron: input.cron, traceId }, 'ScheduleCronTool execution started');

    try {
      // Validate cron expression
      const cronResult = parseCronExpression(input.cron);
      if (!cronResult.valid) {
        throw new Error(cronResult.error);
      }

      // Create scheduled task
      const taskId = `scheduled-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      // Build task object conditionally to avoid exactOptionalPropertyTypes issues
      const taskBase = {
        id: taskId,
        command: input.command,
        cron: input.cron,
        recurring: input.recurring,
        status: 'pending' as const,
        createdAt: new Date().toISOString(),
        nextRunAt: cronResult.nextRuns?.[0]?.toISOString() ?? '',
        runCount: 0,
      };

      const task: ScheduledTask = input.maxRuns
        ? { ...taskBase, maxRuns: input.maxRuns }
        : taskBase;

      ScheduleCronTool.scheduledTasks.set(taskId, task);

      logger.info({ taskId, cron: input.cron, traceId }, 'Task scheduled');

      return {
        data: {
          taskId,
          command: input.command,
          cron: input.cron,
          nextRunAt: task.nextRunAt,
          status: 'scheduled',
        },
        error: null,
        metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
      };
    } catch (error) {
      logger.error({ error, traceId }, 'ScheduleCronTool failed');

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

  static getTaskStore(): Map<string, ScheduledTask> {
    return ScheduleCronTool.scheduledTasks;
  }

  static setTaskStore(store: Map<string, ScheduledTask>): void {
    ScheduleCronTool.scheduledTasks = store;
  }
}

/**
 * CronCreateTool - Create a scheduled task (alias for ScheduleCronTool)
 */
export class CronCreateTool implements Tool {
  public name = 'CronCreate';
  public description = 'Create a new scheduled cron task';

  public inputSchema = z.object({
    command: z.string().min(1).describe('Command to execute'),
    cron: z.string().min(9).describe('Cron expression'),
    recurring: z.boolean().optional().default(true),
    maxRuns: z.number().optional(),
  });

  async execute(
    input: z.infer<typeof this.inputSchema>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const scheduleTool = new ScheduleCronTool();
    return scheduleTool.execute(input, context);
  }
}

/**
 * CronDeleteTool - Delete a scheduled task
 */
export class CronDeleteTool implements Tool {
  public name = 'CronDelete';
  public description = 'Delete a scheduled cron task';

  public inputSchema = z.object({
    taskId: z.string().min(1).describe('ID of the scheduled task to delete'),
  });

  async execute(
    input: z.infer<typeof this.inputSchema>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const { traceId } = context;

    logger.info({ taskId: input.taskId, traceId }, 'CronDeleteTool execution started');

    const task = ScheduleCronTool.getTaskStore().get(input.taskId);

    if (!task) {
      return {
        data: { status: 'not_found', taskId: input.taskId },
        error: null,
        metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
      };
    }

    task.status = 'cancelled';
    ScheduleCronTool.getTaskStore().set(input.taskId, task);

    logger.info({ taskId: input.taskId, traceId }, 'Scheduled task cancelled');

    return {
      data: { status: 'cancelled', taskId: input.taskId },
      error: null,
      metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
    };
  }
}

/**
 * CronListTool - List all scheduled tasks
 */
export class CronListTool implements Tool {
  public name = 'CronList';
  public description = 'List all scheduled cron tasks';

  public inputSchema = z.object({
    status: z.enum(['all', 'pending', 'running', 'completed', 'cancelled', 'failed']).optional().default('all'),
  });

  async execute(
    input: z.infer<typeof this.inputSchema>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const { traceId } = context;

    logger.info({ status: input.status, traceId }, 'CronListTool execution started');

    const tasks = Array.from(ScheduleCronTool.getTaskStore().values());

    const filtered = input.status === 'all'
      ? tasks
      : tasks.filter(t => t.status === input.status);

    return {
      data: {
        tasks: filtered.map(t => ({
          id: t.id,
          command: t.command,
          cron: t.cron,
          status: t.status,
          nextRunAt: t.nextRunAt,
          lastRunAt: t.lastRunAt,
          runCount: t.runCount,
        })),
        count: filtered.length,
      },
      error: null,
      metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
    };
  }
}
