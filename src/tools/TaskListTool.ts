import { z } from 'zod';
import { logger } from '../utils/logger.js';
import type { Tool, ToolContext, ToolResult } from '../Tool';
import { TaskCreateTool } from './TaskCreateTool.js';

/**
 * TaskListTool - List all tasks with optional filtering
 */
export class TaskListTool implements Tool {
  public name = 'TaskList';
  public description = 'List tasks with optional filtering by status';

  public inputSchema = z.object({
    status: z.enum(['pending', 'in_progress', 'completed', 'all']).optional().default('all'),
  });

  async execute(
    input: z.infer<typeof this.inputSchema>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const { traceId } = context;

    logger.info({ status: input.status, traceId }, 'TaskListTool execution started');

    try {
      const tasks = Array.from(TaskCreateTool.getTaskStore().values());

      const filteredTasks = input.status === 'all'
        ? tasks
        : tasks.filter(t => t.status === input.status);

      // Sort by creation date (newest first)
      filteredTasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const result = {
        tasks: filteredTasks,
        total: filteredTasks.length,
        byStatus: {
          pending: tasks.filter(t => t.status === 'pending').length,
          in_progress: tasks.filter(t => t.status === 'in_progress').length,
          completed: tasks.filter(t => t.status === 'completed').length,
        },
      };

      logger.info({ count: filteredTasks.length, traceId }, 'TaskListTool completed');

      return {
        data: result,
        error: null,
        metadata: {
          duration_ms: Date.now() - startTime,
          trace_id: traceId,
        },
      };
    } catch (error) {
      logger.error({ error, traceId }, 'TaskListTool failed');

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
}
