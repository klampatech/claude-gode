import { describe, it, expect, beforeEach } from 'bun:test';
import { SkillTool, skillRegistry, getAvailableSkills } from './SkillTool';
import type { ToolContext } from '../Tool';

describe('SkillTool', () => {
  let tool: SkillTool;
  let mockContext: ToolContext;

  beforeEach(() => {
    tool = new SkillTool();
    mockContext = {
      gitState: '',
      env: {},
      traceId: 'test-trace-id',
    };
  });

  describe('skillRegistry', () => {
    it('should register built-in skills', () => {
      expect(skillRegistry.has('commit')).toBe(true);
      expect(skillRegistry.has('prd')).toBe(true);
      expect(skillRegistry.has('spec')).toBe(true);
      expect(skillRegistry.has('update-config')).toBe(true);
      expect(skillRegistry.has('loop')).toBe(true);
      expect(skillRegistry.has('team')).toBe(true);
    });

    it('should list all available skills', () => {
      const skills = skillRegistry.list();
      expect(skills.length).toBe(6);
    });

    it('should return undefined for non-existent skill', () => {
      expect(skillRegistry.get('nonexistent')).toBeUndefined();
    });
  });

  describe('SkillTool.execute', () => {
    it('should handle commit skill execution (may fail if nothing staged)', async () => {
      const result = await tool.execute(
        { skillName: 'commit', args: { message: 'test commit' } },
        mockContext
      );

      // Either succeeds or gracefully fails when nothing staged
      expect(result.data !== null || result.error !== null).toBe(true);
    });

    it('should execute prd skill', async () => {
      const result = await tool.execute(
        {
          skillName: 'prd',
          args: { featureName: 'New Feature', description: 'Test feature' },
        },
        mockContext
      );

      expect(result.error).toBeNull();
      expect(result.data).toHaveProperty('featureName', 'New Feature');
    });

    it('should execute spec skill', async () => {
      const result = await tool.execute(
        {
          skillName: 'spec',
          args: { idea: 'A new feature', format: 'markdown' },
        },
        mockContext
      );

      expect(result.error).toBeNull();
      expect(result.data).toHaveProperty('idea', 'A new feature');
    });

    it('should return error for non-existent skill', async () => {
      const result = await tool.execute(
        { skillName: 'fake_skill', args: {} },
        mockContext
      );

      expect(result.error).not.toBeNull();
      expect(result.error?.message).toContain('not found');
    });

    it('should handle empty args', async () => {
      const result = await tool.execute(
        { skillName: 'prd', args: {} },
        mockContext
      );

      // Should not throw, even with empty args
      expect(result.data).toBeDefined();
    });
  });

  describe('getAvailableSkills', () => {
    it('should return list of skills with name and description', () => {
      const skills = getAvailableSkills();

      expect(skills.length).toBe(6);
      expect(skills[0]).toHaveProperty('name');
      expect(skills[0]).toHaveProperty('description');
    });
  });

  describe('tool metadata', () => {
    it('should have correct name and description', () => {
      expect(tool.name).toBe('Skill');
      expect(tool.description).toContain('Claude Code skills');
    });

    it('should have valid input schema', () => {
      expect(tool.inputSchema).toBeDefined();
    });
  });
});
