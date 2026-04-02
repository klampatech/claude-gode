/**
 * SkillTool - Execute built-in Claude Code skills
 *
 * Skills are reusable capabilities that can be invoked by the agent.
 * Examples: commit, prd, spec, update-config, loop, etc.
 */

import { z } from 'zod';
import { logger } from '../utils/logger.js';
import type { Tool, ToolContext, ToolResult } from '../Tool.js';

/**
 * Input types for each skill
 */
interface CommitSkillInput {
  message: string;
  files?: string[];
}

interface PrdSkillInput {
  featureName: string;
  description?: string;
}

interface SpecSkillInput {
  idea: string;
  format?: 'markdown' | 'json';
}

interface UpdateConfigSkillInput {
  key: string;
  value: unknown;
  scope?: 'global' | 'local';
}

interface LoopSkillInput {
  command: string;
  interval: string;
  count?: number;
}

interface TeamSkillInput {
  teamName: string;
  taskSpec: string;
  agentTypes?: string[];
}

/**
 * Available built-in skills
 */
export interface Skill {
  /** Unique identifier */
  name: string;
  /** Human-readable description */
  description: string;
  /** Input schema for skill parameters */
  inputSchema: z.ZodType<unknown>;
  /** Execute the skill */
  execute(input: unknown, context: ToolContext): Promise<ToolResult>;
}

/**
 * Skill registry for built-in skills
 */
class SkillRegistry {
  private skills: Map<string, Skill> = new Map();

  register(skill: Skill): void {
    this.skills.set(skill.name, skill);
    logger.debug({ skillName: skill.name }, 'Skill registered');
  }

  get(name: string): Skill | undefined {
    return this.skills.get(name);
  }

  list(): Skill[] {
    return Array.from(this.skills.values());
  }

  has(name: string): boolean {
    return this.skills.has(name);
  }
}

/**
 * Global skill registry instance
 */
export const skillRegistry = new SkillRegistry();

/**
 * Built-in skills definitions
 */
export const BUILTIN_SKILLS: Skill[] = [
  {
    name: 'commit',
    description: 'Create a git commit with staged changes',
    inputSchema: z.object({
      message: z.string().min(1).describe('Commit message'),
      files: z.array(z.string()).optional().describe('Files to commit'),
    }),
    execute: async (input, context) => {
      const { message, files } = input as CommitSkillInput;
      const { execa } = await import('execa');

      try {
        // Stage files if provided
        if (files && files.length > 0) {
          await execa('git', ['add', ...files]);
        }

        // Create commit
        const result = await execa('git', ['commit', '-m', message]);

        return {
          data: { message, output: result.stdout },
          error: null,
          metadata: { duration_ms: 0, trace_id: context.traceId },
        };
      } catch (error) {
        return {
          data: null,
          error: error instanceof Error ? error : new Error(String(error)),
          metadata: { duration_ms: 0, trace_id: context.traceId },
        };
      }
    },
  },
  {
    name: 'prd',
    description: 'Generate a Product Requirements Document (PRD) for a new feature',
    inputSchema: z.object({
      featureName: z.string().min(1).describe('Name of the feature'),
      description: z.string().optional().describe('Brief feature description'),
    }),
    execute: async (input, context) => {
      const { featureName, description } = input as PrdSkillInput;

      // This would generate a PRD - for now return a placeholder
      return {
        data: {
          featureName,
          description: description || '',
          status: 'PRD generation requires skill system integration',
        },
        error: null,
        metadata: { duration_ms: 0, trace_id: context.traceId },
      };
    },
  },
  {
    name: 'spec',
    description: 'Generate a comprehensive specification document',
    inputSchema: z.object({
      idea: z.string().min(1).describe('Feature idea or description'),
      format: z.enum(['markdown', 'json']).optional().default('markdown'),
    }),
    execute: async (input, context) => {
      const { idea, format } = input as SpecSkillInput;

      // Spec generation placeholder
      return {
        data: {
          idea,
          format,
          status: 'Spec generation requires skill system integration',
        },
        error: null,
        metadata: { duration_ms: 0, trace_id: context.traceId },
      };
    },
  },
  {
    name: 'update-config',
    description: 'Configure Claude Code settings via settings.json',
    inputSchema: z.object({
      key: z.string().describe('Setting key (e.g., "theme", "model")'),
      value: z.unknown().describe('Setting value'),
      scope: z.enum(['global', 'local']).optional().default('local'),
    }),
    execute: async (input, context) => {
      const { key, value, scope } = input as UpdateConfigSkillInput;

      // Config update placeholder
      return {
        data: {
          key,
          value,
          scope,
          status: 'Config update requires settings.json integration',
        },
        error: null,
        metadata: { duration_ms: 0, trace_id: context.traceId },
      };
    },
  },
  {
    name: 'loop',
    description: 'Run a command on a recurring interval',
    inputSchema: z.object({
      command: z.string().min(1).describe('Command to run'),
      interval: z.string().describe('Interval (e.g., "5m", "10m", "1h")'),
      count: z.number().optional().describe('Number of times to run'),
    }),
    execute: async (input, context) => {
      const { command, interval, count } = input as LoopSkillInput;

      // Loop scheduling placeholder
      return {
        data: {
          command,
          interval,
          count,
          status: 'Loop scheduling requires cron integration',
        },
        error: null,
        metadata: { duration_ms: 0, trace_id: context.traceId },
      };
    },
  },
  {
    name: 'team',
    description: 'Summon a team of agents for parallel work',
    inputSchema: z.object({
      teamName: z.string().min(1).describe('Name for the team'),
      taskSpec: z.string().describe('Task specification'),
      agentTypes: z.array(z.string()).optional().describe('Types of agents to spawn'),
    }),
    execute: async (input, context) => {
      const { teamName, taskSpec, agentTypes } = input as TeamSkillInput;

      return {
        data: {
          teamName,
          taskSpec,
          agentTypes: agentTypes || ['coder'],
          status: 'Team creation requires team system integration',
        },
        error: null,
        metadata: { duration_ms: 0, trace_id: context.traceId },
      };
    },
  },
];

// Register all built-in skills
for (const skill of BUILTIN_SKILLS) {
  skillRegistry.register(skill);
}

/**
 * SkillTool - Execute built-in skills
 */
export class SkillTool implements Tool {
  public name = 'Skill';
  public description = 'Execute built-in Claude Code skills (commit, prd, spec, etc.)';

  public inputSchema = z.object({
    skillName: z.string().min(1).describe('Name of the skill to execute'),
    args: z.record(z.unknown()).optional().describe('Arguments to pass to the skill'),
  });

  async execute(
    input: z.infer<typeof this.inputSchema>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const { traceId } = context;

    logger.info({ skillName: input.skillName, args: input.args, traceId }, 'SkillTool execution started');

    try {
      const skill = skillRegistry.get(input.skillName);

      if (!skill) {
        const availableSkills = skillRegistry.list().map(s => s.name).join(', ');
        throw new Error(
          `Skill "${input.skillName}" not found. Available skills: ${availableSkills}`
        );
      }

      // Execute the skill
      const result = await skill.execute(input.args || {}, context);

      logger.info(
        { skillName: input.skillName, durationMs: Date.now() - startTime, traceId },
        'SkillTool completed'
      );

      return {
        data: result.data,
        error: result.error,
        metadata: {
          duration_ms: Date.now() - startTime,
          trace_id: traceId,
        },
      };
    } catch (error) {
      logger.error({ error, skillName: input.skillName, traceId }, 'SkillTool failed');

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

/**
 * Get list of available skills (helper for agent)
 */
export function getAvailableSkills(): Array<{ name: string; description: string }> {
  return skillRegistry.list().map(skill => ({
    name: skill.name,
    description: skill.description,
  }));
}
