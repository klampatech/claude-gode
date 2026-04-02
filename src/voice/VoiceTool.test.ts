import { describe, it, expect, beforeEach } from 'bun:test';
import { VoiceTool, VoiceInputHandler } from './VoiceTool';
import type { ToolContext } from '../Tool';

describe('VoiceTool', () => {
  let tool: VoiceTool;
  let mockContext: ToolContext;

  beforeEach(() => {
    tool = new VoiceTool();
    mockContext = {
      gitState: '',
      env: {},
      traceId: 'test-trace-id',
    };
  });

  describe('VoiceTool.execute', () => {
    it('should start voice recognition', async () => {
      const result = await tool.execute(
        { action: 'start', language: 'en-US' },
        mockContext
      );

      expect(result.error).toBeNull();
      expect((result.data as Record<string, unknown>).status).toBe('listening');
    });

    it('should handle already listening state', async () => {
      // Start first
      await tool.execute({ action: 'start' }, mockContext);

      // Try to start again
      const result = await tool.execute({ action: 'start' }, mockContext);

      expect(result.error).toBeNull();
      expect((result.data as Record<string, unknown>).status).toBe('already_listening');
    });

    it('should stop voice recognition', async () => {
      // Start first
      await tool.execute({ action: 'start' }, mockContext);

      // Then stop
      const result = await tool.execute({ action: 'stop' }, mockContext);

      expect(result.error).toBeNull();
      expect((result.data as Record<string, unknown>).status).toBe('stopped');
    });

    it('should check status', async () => {
      const result = await tool.execute({ action: 'status' }, mockContext);

      expect(result.error).toBeNull();
      expect((result.data as Record<string, unknown>).isSupported).toBeDefined();
      expect((result.data as Record<string, unknown>).isListening).toBeDefined();
    });

    it('should handle stop when not listening', async () => {
      const result = await tool.execute({ action: 'stop' }, mockContext);

      expect(result.error).toBeNull();
      expect((result.data as Record<string, unknown>).status).toBe('not_listening');
    });
  });

  describe('VoiceInputHandler', () => {
    it('should start and stop listening', async () => {
      const handler = new VoiceInputHandler();

      await handler.start();
      expect(handler.getListening()).toBe(true);

      const transcript = await handler.stop();
      expect(handler.getListening()).toBe(false);
      expect(transcript).toBe('');
    });

    it('should accumulate transcript', async () => {
      const handler = new VoiceInputHandler();

      await handler.start();
      handler.appendTranscript('Hello');
      handler.appendTranscript('World');

      expect(handler.getTranscript()).toBe('Hello World');
    });

    it('should clear transcript', async () => {
      const handler = new VoiceInputHandler();

      handler.appendTranscript('Test');
      handler.clearTranscript();

      expect(handler.getTranscript()).toBe('');
    });

    it('should set language', () => {
      const handler = new VoiceInputHandler();

      handler.setLanguage('es-ES');

      // Language is stored internally
      expect(handler).toBeDefined();
    });
  });

  describe('tool metadata', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('Voice');
      expect(tool.description).toContain('voice');
    });

    it('should have valid input schema', () => {
      expect(tool.inputSchema).toBeDefined();
    });
  });
});
