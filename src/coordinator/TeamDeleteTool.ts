/**
 * TeamDeleteTool - Tool for deleting agent teams
 */

import { z } from 'zod';
import { logger } from '../utils/logger.js';
import type { Tool, ToolContext, ToolResult } from '../Tool.js';
import { TeamCreateTool } from './TeamCreateTool.js';

/**
 * Input schema for TeamDeleteTool
 */
export const TeamDeleteToolInputSchema = z.object({
  teamName: z.string().describe('Name of the team to delete'),
});

export type TeamDeleteToolInput = z.infer<typeof TeamDeleteToolInputSchema>;

/**
 * Tool for deleting agent teams
 */
export class TeamDeleteTool implements Tool {
  public name = 'TeamDelete';
  public description = 'Delete a team of agents';
  public inputSchema = TeamDeleteToolInputSchema;

  private teamCreateTool: TeamCreateTool;

  constructor() {
    this.teamCreateTool = new TeamCreateTool();
  }

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const startTime = Date.now();
    const traceId = context.traceId;

    try {
      const args = input as TeamDeleteToolInput;
      const teamId = `team-${args.teamName}`;

      // Get the team
      const team = this.teamCreateTool.getTeam(args.teamName);
      if (!team) {
        return {
          data: null,
          error: new Error(`Team '${args.teamName}' does not exist`),
          metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
        };
      }

      // Terminate all agents
      team.terminate();

      logger.info({ teamId, teamName: args.teamName, traceId }, 'Team deleted');

      return {
        data: {
          teamId,
          teamName: args.teamName,
          message: `Team '${args.teamName}' deleted successfully`,
        },
        error: null,
        metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
      };
    } catch (error) {
      const err = error as Error;
      logger.error({ err, traceId }, 'TeamDeleteTool execution failed');
      return {
        data: null,
        error: err,
        metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
      };
    }
  }
}
