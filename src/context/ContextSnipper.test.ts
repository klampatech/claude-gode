import { describe, it, expect } from 'bun:test';
import {
  splitIntoChunks,
  snipContext,
  buildSnippedPrompt,
  DEFAULT_SNIPPER_CONFIG,
} from './ContextSnipper';

describe('ContextSnipper', () => {
  describe('splitIntoChunks', () => {
    it('should split context into chunks by section', () => {
      const context = {
        userRequest: 'Fix the bug in login',
        gitState: 'M src/auth.ts',
        fileTree: 'file1.ts\nfile2.ts\nfile3.ts',
        envVars: 'NODE_ENV=development',
        memories: 'Remember to add tests',
        history: 'old message 1\nold message 2',
        lspSymbols: 'function login()',
      };

      const chunks = splitIntoChunks(context);

      expect(chunks.length).toBe(7);
      expect(chunks.find(c => c.section === 'user_request')?.importance).toBe(100);
      expect(chunks.find(c => c.section === 'git_state')?.importance).toBe(80);
      expect(chunks.find(c => c.section === 'file_tree')?.importance).toBe(50);
    });

    it('should handle missing sections gracefully', () => {
      const context = {
        userRequest: 'Hello',
        gitState: 'M src/file.ts',
      };

      const chunks = splitIntoChunks(context);

      expect(chunks.length).toBe(2);
    });
  });

  describe('snipContext', () => {
    it('should return context unchanged when under limit', () => {
      const context = {
        userRequest: 'Hello',
        gitState: 'M src/file.ts',
      };

      const { result: snipResult } = snipContext(context, {
        maxTokens: 10000, // Large enough
      });

      expect(snipResult.strategies).toContain('none');
    });

    it('should remove low-importance sections when over limit', () => {
      const largeFileTree = 'file' + 'a'.repeat(10000);
      const context = {
        userRequest: 'Quick question',
        gitState: 'M src/file.ts',
        fileTree: largeFileTree,
        envVars: 'VAR=value',
        lspSymbols: 'symbol1\nsymbol2\nsymbol3',
      };

      const { result: snipResult } = snipContext(context, {
        maxTokens: 100, // Very small to force snipping
        charsPerToken: 4,
      });

      // Should have removed lsp_symbols (importance 30) and possibly file_tree
      expect(snipResult.strategies.length).toBeGreaterThan(0);
      expect(snipResult.originalLength).toBeGreaterThan(snipResult.snippedLength);
    });

    it('should truncate large sections when removal insufficient', () => {
      const largeGitState = 'M ' + 'a'.repeat(5000);
      const context = {
        userRequest: 'Question',
        gitState: largeGitState,
      };

      const { result: snipResult } = snipContext(context, {
        maxTokens: 100,
        charsPerToken: 4,
      });

      expect(snipResult.strategies.some(s => s.includes('truncate'))).toBe(true);
    });
  });

  describe('buildSnippedPrompt', () => {
    it('should build prompt with snipped context', () => {
      const context = {
        userRequest: 'Fix bug',
        gitState: 'M src/a.ts\nM src/b.ts',
        fileTree: 'src/a.ts\nsrc/b.ts',
        envVars: 'NODE_ENV=test',
      };

      const prompt = buildSnippedPrompt(context, 'Fix the login bug');

      expect(prompt).toContain('## User Request');
      expect(prompt).toContain('Fix the login bug');
      expect(prompt).toContain('## Git State');
      expect(prompt).toContain('## File Tree');
    });

    it('should handle empty context', () => {
      const prompt = buildSnippedPrompt({}, 'What is the answer?');

      expect(prompt).toContain('What is the answer?');
    });
  });

  describe('token estimation', () => {
    it('should estimate tokens conservatively', () => {
      const text = 'a'.repeat(400);
      const tokens = Math.ceil(text.length / DEFAULT_SNIPPER_CONFIG.charsPerToken);
      expect(tokens).toBe(100);
    });
  });
});
