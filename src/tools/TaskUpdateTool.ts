import { z } from 'zod';
import { logger } from '../utils/logger.js';
import type { Tool, ToolContext, ToolResult } from '../Tool';
import type { Task } from './TaskCreateTool.js';
import { TaskCreateTool } from './TaskCreateTool.js';

/**
 * TaskUpdateTool - Update an existing task's status or content
 */
export class TaskUpdateTool implements Tool {
  public name = 'TaskUpdate';
  public description = 'Update an existing task (change status or content)';

  public inputSchema = z.object({
    id: z.string().describe('Task ID to update'),
    content: z.string().optional().describe('New task content'),
    status: z.enum(['pending', 'in_progress', 'completed']).optional(),
  });

  // Shared task storage
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

    logger.info({ taskId: input.id, traceId }, 'TaskUpdateTool execution started');

    try {
      const task = TaskCreateTool.getTaskStore().get(input.id);

      if (!task) {
        throw new Error(`Task not found: ${input.id}`);
      }

      // Update fields if provided
      if (input.content !== undefined) {
        task.content = input.content;
      }
      if (input.status !== undefined) {
        task.status = input.status;
      }
      task.updatedAt = new Date().toISOString();

      logger.info({ taskId: input.id, traceId }, 'TaskUpdateTool completed');

      return {
        data: task,
        error: null,
        metadata: {
          duration_ms: Date.now() - startTime,
          trace_id: traceId,
        },
      };
    } catch (error) {
      logger.error({ taskId: input.id, error, traceId }, 'TaskUpdateTool failed');

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
