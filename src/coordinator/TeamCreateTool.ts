/**
 * TeamCreateTool - Tool for creating agent teams
 */

import { z } from 'zod';
import { logger } from '../utils/logger.js';
import type { Tool, ToolContext, ToolResult } from '../Tool.js';
import { AgentCoordinator, type AgentRole } from './types.js';

/**
 * Input schema for TeamCreateTool
 */
export const TeamCreateToolInputSchema = z.object({
  teamName: z.string().describe('Name for the team'),
  maxAgents: z.number().optional().default(10).describe('Maximum number of agents in the team'),
  initialAgents: z
    .array(
      z.object({
        name: z.string(),
        role: z.enum(['researcher', 'coder', 'reviewer', 'custom']),
        description: z.string().optional(),
        instructions: z.string().optional(),
      }),
    )
    .optional()
    .describe('Initial agents to spawn'),
});

export type TeamCreateToolInput = z.infer<typeof TeamCreateToolInputSchema>;

/**
 * Tool for creating agent teams
 */
export class TeamCreateTool implements Tool {
  public name = 'TeamCreate';
  public description = 'Create a team of agents for coordinated task execution';
  public inputSchema = TeamCreateToolInputSchema;

  private teams: Map<string, AgentCoordinator> = new Map();

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const startTime = Date.now();
    const traceId = context.traceId;

    try {
      const args = input as TeamCreateToolInput;
      const teamId = `team-${args.teamName}`;

      // Check if team already exists
      if (this.teams.has(teamId)) {
        return {
          data: null,
          error: new Error(`Team '${args.teamName}' already exists`),
          metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
        };
      }

      // Create the coordinator
      const coordinator = new AgentCoordinator(teamId, args.maxAgents ?? 10, {
        projectPath: context.projectPath ?? context.cwd,
        gitState: context.gitState,
        env: context.env,
      });

      // Spawn initial agents if provided
      const spawnedAgents: Array<{ name: string; agentId: string; role: AgentRole }> = [];
      if (args.initialAgents) {
        for (const agentConfig of args.initialAgents) {
          const agent = coordinator.spawnAgent(
            agentConfig.name,
            agentConfig.role,
            agentConfig.description,
            agentConfig.instructions,
          );
          if (agent) {
            spawnedAgents.push({
              name: agent.name,
              agentId: agent.id,
              role: agent.role,
            });
          }
        }
      }

      this.teams.set(teamId, coordinator);

      logger.info(
        {
          teamId,
          teamName: args.teamName,
          agentCount: spawnedAgents.length,
          traceId,
        },
        'Team created',
      );

      return {
        data: {
          teamId,
          teamName: args.teamName,
          maxAgents: args.maxAgents ?? 10,
          agents: spawnedAgents,
        },
        error: null,
        metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
      };
    } catch (error) {
      const err = error as Error;
      logger.error({ err, traceId }, 'TeamCreateTool execution failed');
      return {
        data: null,
        error: err,
        metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
      };
    }
  }

  /**
   * Get coordinator for external access
   */
  getTeam(teamName: string): AgentCoordinator | undefined {
    return this.teams.get(`team-${teamName}`);
  }
}
