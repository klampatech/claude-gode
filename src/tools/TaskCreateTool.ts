import { z } from 'zod';
import { logger } from '../utils/logger.js';
import type { Tool, ToolContext, ToolResult } from '../Tool';

export interface Task {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed';
  createdAt: string;
  updatedAt: string;
}

/**
 * TaskCreateTool - Create a new task
 */
export class TaskCreateTool implements Tool {
  public name = 'TaskCreate';
  public description = 'Create a new task in the task list';

  public inputSchema = z.object({
    content: z.string().min(1).describe('Task content'),
    status: z.enum(['pending', 'in_progress', 'completed']).optional().default('pending'),
  });

  // Shared task storage - in production this would be a database
  private static tasks: Map<string, Task> = new Map();

  // Register external task store
  static setTaskStore(store: Map<string, Task>): void {
    this.tasks = store;
  }

  // Get the task store for other tools to use
  static getTaskStore(): Map<string, Task> {
    return this.tasks;
  }

  async execute(
    input: z.infer<typeof this.inputSchema>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const { traceId } = context;

    logger.info({ content: input.content, traceId }, 'TaskCreateTool execution started');

    try {
      const now = new Date().toISOString();
      const task: Task = {
        id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        content: input.content,
        status: input.status,
        createdAt: now,
        updatedAt: now,
      };

      TaskCreateTool.tasks.set(task.id, task);

      logger.info({ taskId: task.id, traceId }, 'TaskCreateTool completed');

      return {
        data: task,
        error: null,
        metadata: {
          duration_ms: Date.now() - startTime,
          trace_id: traceId,
        },
      };
    } catch (error) {
      logger.error({ error, traceId }, 'TaskCreateTool failed');

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
