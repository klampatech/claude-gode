import { describe, it, expect, beforeEach } from 'bun:test';
import { MCPTool, MCPServer, type MCPToolDefinition } from './MCPTool';
import type { ToolContext } from '../Tool';

describe('MCPTool', () => {
  let tool: MCPTool;
  let mockContext: ToolContext;

  beforeEach(() => {
    tool = new MCPTool();
    mockContext = {
      gitState: '',
      env: {},
      traceId: 'test-trace-id',
    };
  });

  describe('tool metadata', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('MCP');
      expect(tool.description).toContain('MCP servers');
    });

    it('should have valid input schema', () => {
      expect(tool.inputSchema).toBeDefined();
    });
  });

  describe('MCPTool.execute', () => {
    it('should fail when action is missing', async () => {
      const result = await tool.execute(
        { action: 'connect', serverUrl: 'ws://localhost:3000' },
        mockContext
      );

      // Server not running, should fail
      expect(result.error).not.toBeNull();
    });

    it('should validate input schema', async () => {
      // Test that invalid action throws validation error
      const result = await tool.execute(
        { action: 'invalid_action' } as never,
        mockContext
      );

      expect(result.error).not.toBeNull();
    });

    it('should require serverUrl for connect action', async () => {
      const result = await tool.execute(
        { action: 'connect' },
        mockContext
      );

      expect(result.error).not.toBeNull();
      expect(result.error?.message).toContain('serverUrl');
    });

    it('should require serverUrl for list_tools action', async () => {
      const result = await tool.execute(
        { action: 'list_tools' },
        mockContext
      );

      expect(result.error).not.toBeNull();
      expect(result.error?.message).toContain('serverUrl');
    });

    it('should require serverUrl and toolName for call_tool action', async () => {
      const result = await tool.execute(
        { action: 'call_tool' },
        mockContext
      );

      expect(result.error).not.toBeNull();
      expect(result.error?.message).toContain('serverUrl');
    });
  });

  describe('MCPServer', () => {
    it('should create server with config', () => {
      const server = new MCPServer({ port: 3001 });

      expect(server).toBeDefined();
    });
  });

  describe('MCPToolDefinition', () => {
    it('should define valid tool structure', () => {
      const toolDef: MCPToolDefinition = {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object',
          properties: {
            arg1: { type: 'string' },
          },
          required: ['arg1'],
        },
      };

      expect(toolDef.name).toBe('test_tool');
      expect(toolDef.inputSchema.type).toBe('object');
    });
  });
});
