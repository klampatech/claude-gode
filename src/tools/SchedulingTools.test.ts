import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import {
  ScheduleCronTool,
  CronCreateTool,
  CronDeleteTool,
  CronListTool,
  type ScheduledTask,
} from './SchedulingTools';
import type { ToolContext } from '../Tool';

describe('SchedulingTools', () => {
  let mockContext: ToolContext;
  let originalTaskStore: Map<string, ScheduledTask>;

  beforeEach(() => {
    mockContext = {
      gitState: '',
      env: {},
      traceId: 'test-trace-id',
    };
    // Clear task store before each test
    originalTaskStore = ScheduleCronTool.getTaskStore();
    ScheduleCronTool.setTaskStore(new Map());
  });

  afterEach(() => {
    // Restore task store
    ScheduleCronTool.setTaskStore(originalTaskStore);
  });

  describe('ScheduleCronTool', () => {
    let tool: ScheduleCronTool;

    beforeEach(() => {
      tool = new ScheduleCronTool();
    });

    it('should schedule a task with valid cron', async () => {
      const result = await tool.execute(
        {
          command: 'echo "hello"',
          cron: '0 9 * * *',
          recurring: true,
        },
        mockContext
      );

      expect(result.error).toBeNull();
      expect((result.data as Record<string, unknown>).taskId).toBeDefined();
      expect((result.data as Record<string, unknown>).status).toBe('scheduled');
    });

    it('should reject invalid cron expression', async () => {
      const result = await tool.execute(
        {
          command: 'echo "hello"',
          cron: 'invalid-cron',
          recurring: true,
        },
        mockContext
      );

      expect(result.error).not.toBeNull();
      expect(result.error?.message).toContain('Invalid cron');
    });

    it('should accept one-shot non-recurring tasks', async () => {
      const result = await tool.execute(
        {
          command: 'echo "once"',
          cron: '0 9 * * *',
          recurring: false,
        },
        mockContext
      );

      expect(result.error).toBeNull();
      // Verify task was created in the store
      const task = ScheduleCronTool.getTaskStore().values().next().value;
      expect(task?.recurring).toBe(false);
    });

    it('should respect maxRuns limit', async () => {
      const result = await tool.execute(
        {
          command: 'echo "limited"',
          cron: '0 9 * * *',
          recurring: true,
          maxRuns: 3,
        },
        mockContext
      );

      expect(result.error).toBeNull();
      const task = ScheduleCronTool.getTaskStore().values().next().value;
      expect(task?.maxRuns).toBe(3);
    });

    it('should have correct tool metadata', () => {
      expect(tool.name).toBe('ScheduleCron');
      expect(tool.description).toContain('cron');
    });
  });

  describe('CronCreateTool', () => {
    let tool: CronCreateTool;

    beforeEach(() => {
      tool = new CronCreateTool();
    });

    it('should create a scheduled task', async () => {
      const result = await tool.execute(
        {
          command: 'test command',
          cron: '*/5 * * * *',
          recurring: true,
        },
        mockContext
      );

      expect(result.error).toBeNull();
      expect((result.data as Record<string, unknown>).taskId).toBeDefined();
    });

    it('should have correct tool metadata', () => {
      expect(tool.name).toBe('CronCreate');
    });
  });

  describe('CronDeleteTool', () => {
    let tool: CronDeleteTool;

    beforeEach(() => {
      tool = new CronDeleteTool();
    });

    it('should return not_found for non-existent task', async () => {
      const result = await tool.execute(
        { taskId: 'nonexistent-id' },
        mockContext
      );

      expect(result.error).toBeNull();
      expect((result.data as Record<string, unknown>).status).toBe('not_found');
    });

    it('should cancel existing task', async () => {
      // First create a task
      const scheduleTool = new ScheduleCronTool();
      const createResult = await scheduleTool.execute(
        { command: 'test', cron: '0 9 * * *', recurring: true },
        mockContext
      );

      const taskId = (createResult.data as Record<string, unknown>).taskId as string;

      // Now delete it
      const result = await tool.execute({ taskId }, mockContext);

      expect((result.data as Record<string, unknown>).status).toBe('cancelled');
    });
  });

  describe('CronListTool', () => {
    let tool: CronListTool;

    beforeEach(() => {
      tool = new CronListTool();
    });

    it('should list all tasks by default', async () => {
      const result = await tool.execute(
        { status: 'all' },
        mockContext
      );

      expect(result.error).toBeNull();
      expect((result.data as Record<string, unknown>).tasks).toBeDefined();
      expect((result.data as Record<string, unknown>).count).toBeDefined();
    });

    it('should filter by status', async () => {
      const result = await tool.execute(
        { status: 'pending' },
        mockContext
      );

      expect(result.error).toBeNull();
    });

    it('should have correct tool metadata', () => {
      expect(tool.name).toBe('CronList');
    });
  });
});
