import { describe, it, expect, beforeEach } from 'bun:test';
import { ToolExecutor, createToolContext } from './ToolExecutor';
import { FileReadTool } from './tools/FileReadTool';
import { FileWriteTool } from './tools/FileWriteTool';
import { BashTool, type PermissionMode } from './tools/BashTool';
import { GlobTool } from './tools/GlobTool';
import { GrepTool } from './tools/GrepTool';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';

const testDir = join('/tmp', `claude-code-test-${uuidv4()}`);

describe('ToolExecutor', () => {
  let executor: ToolExecutor;
  let context: ReturnType<typeof createToolContext>;

  beforeEach(async () => {
    await mkdir(testDir, { recursive: true });
    executor = new ToolExecutor({ globalTimeoutMs: 5000 });
    executor.registerTool(new FileReadTool());
    executor.registerTool(new FileWriteTool());
    executor.registerTool(new GlobTool());
    executor.registerTool(new GrepTool());
    executor.registerTool(new BashTool({ permissionMode: 'allow' }));
    context = createToolContext({
      cwd: testDir,
      env: {},
      sessionId: uuidv4(),
      traceId: uuidv4(),
    });
  });

  describe('FileReadTool', () => {
    it('should read a file', async () => {
      const testFile = join(testDir, 'test.txt');
      const content = 'Hello, World!';
      await writeFile(testFile, content, 'utf-8');

      const result = await executor.executeTool('FileRead', { path: testFile }, context);

      expect(result.result.error).toBeNull();
      expect(result.result.data).toBe(content);
    });

    it('should handle missing files', async () => {
      const result = await executor.executeTool('FileRead', { path: join(testDir, 'missing.txt') }, context);

      expect(result.result.error).not.toBeNull();
      expect(result.result.data).toBeNull();
    });
  });

  describe('FileWriteTool', () => {
    it('should write a file', async () => {
      const testFile = join(testDir, 'output.txt');
      const content = 'Test content';

      const result = await executor.executeTool('FileWrite', { path: testFile, content }, context);

      expect(result.result.error).toBeNull();
      expect(result.result.data).toEqual({ path: testFile, bytesWritten: content.length });
    });

    it('should create parent directories', async () => {
      const testFile = join(testDir, 'nested', 'dir', 'output.txt');
      const content = 'Nested content';

      const result = await executor.executeTool('FileWrite', { path: testFile, content }, context);

      expect(result.result.error).toBeNull();
    });
  });

  describe('GlobTool', () => {
    it('should find files matching pattern', async () => {
      await writeFile(join(testDir, 'a.ts'), 'content');
      await writeFile(join(testDir, 'b.ts'), 'content');
      await writeFile(join(testDir, 'c.js'), 'content');

      const result = await executor.executeTool('Glob', { pattern: '*.ts', cwd: testDir }, context);

      expect(result.result.error).toBeNull();
      const data = result.result.data as { files: string[]; count: number };
      expect(data.count).toBeGreaterThanOrEqual(2);
    });
  });

  describe('GrepTool', () => {
    it('should find pattern in files', async () => {
      const testFile = join(testDir, 'search.txt');
      await writeFile(testFile, 'const foo = "bar";\nconsole.log(foo);', 'utf-8');

      const result = await executor.executeTool('Grep', { pattern: 'foo', path: testDir }, context);

      expect(result.result.error).toBeNull();
      const data = result.result.data as { matches: Array<{ lineContent: string }> };
      expect(data.matches.length).toBeGreaterThan(0);
    });
  });

  describe('BashTool', () => {
    it('should execute commands in allow mode', async () => {
      const result = await executor.executeTool('Bash', { command: 'echo "hello"' }, context);

      expect(result.result.error).toBeNull();
      const data = result.result.data as { stdout: string };
      expect(data.stdout).toBe('hello');
    });

    it('should block commands in deny mode', async () => {
      const denyExecutor = new ToolExecutor();
      denyExecutor.registerTool(new BashTool({ permissionMode: 'deny' }));

      const result = await denyExecutor.executeTool('Bash', { command: 'echo "test"' }, context);

      expect(result.result.error).not.toBeNull();
      expect(result.result.error?.message).toContain('blocked');
    });

    it('should block dangerous commands in limited mode', async () => {
      const limitedExecutor = new ToolExecutor();
      limitedExecutor.registerTool(new BashTool({ permissionMode: 'limited' }));

      const result = await limitedExecutor.executeTool('Bash', { command: 'rm -rf /' }, context);

      expect(result.result.error).not.toBeNull();
    });
  });

  describe('parallel execution', () => {
    it('should execute tools in parallel', async () => {
      await writeFile(join(testDir, 'f1.txt'), 'content1');
      await writeFile(join(testDir, 'f2.txt'), 'content2');

      const results = await executor.executeParallel(
        [
          { toolName: 'FileRead', input: { path: join(testDir, 'f1.txt') } },
          { toolName: 'FileRead', input: { path: join(testDir, 'f2.txt') } },
        ],
        context,
      );

      expect(results).toHaveLength(2);
      expect(results[0].result.error).toBeNull();
      expect(results[1].result.error).toBeNull();
    });
  });
});
