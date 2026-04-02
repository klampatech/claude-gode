/**
 * AgentTool - Tool for spawning subagents in multi-agent orchestration
 */

import { z } from 'zod';
import { logger } from '../utils/logger.js';
import type { Tool, ToolContext, ToolResult } from '../Tool.js';
import { AgentCoordinator } from './types.js';

/**
 * Input schema for AgentTool
 */
export const AgentToolInputSchema = z.object({
  action: z.enum(['spawn', 'status', 'result', 'terminate']).describe('Action to perform'),
  name: z.string().optional().describe('Name for the spawned agent'),
  role: z.enum(['researcher', 'coder', 'reviewer', 'custom']).optional().describe('Role for the spawned agent'),
  description: z.string().optional().describe('Description of the agent task'),
  instructions: z.string().optional().describe('Instructions for the agent'),
  agentId: z.string().optional().describe('Agent ID for status/result actions'),
  maxAgents: z.number().optional().default(10).describe('Maximum number of agents in pool'),
});

export type AgentToolInput = z.infer<typeof AgentToolInputSchema>;

/**
 * Shared coordinator map - singleton for cross-tool coordination
 */
const sharedCoordinators: Map<string, AgentCoordinator> = new Map();

function getOrCreateCoordinator(teamId: string, maxAgents: number, context: ToolContext): AgentCoordinator {
  let coordinator = sharedCoordinators.get(teamId);
  if (!coordinator) {
    coordinator = new AgentCoordinator(teamId, maxAgents, {
      projectPath: context.projectPath ?? context.cwd,
      gitState: context.gitState,
      env: context.env,
    });
    sharedCoordinators.set(teamId, coordinator);
  }
  return coordinator;
}

/**
 * Tool for spawning and managing subagents
 */
export class AgentTool implements Tool {
  public name = 'Agent';
  public description = 'Spawn and manage subagents for parallel task execution';
  public inputSchema = AgentToolInputSchema;

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const startTime = Date.now();
    const traceId = context.traceId;

    try {
      const args = input as AgentToolInput;
      const sessionId = context.sessionId ?? 'default';
      const teamId = `team-${sessionId}`;
      const maxAgents = args.maxAgents ?? 10;

      // Get or create coordinator for this session
      const coordinator = getOrCreateCoordinator(teamId, maxAgents, context);

      switch (args.action) {
        case 'spawn': {
          if (!args.name || !args.role) {
            return {
              data: null,
              error: new Error('name and role are required for spawn action'),
              metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
            };
          }

          if (coordinator.isAtPoolLimit()) {
            return {
              data: null,
              error: new Error(`Agent pool limit (${maxAgents}) reached`),
              metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
            };
          }

          const agent = coordinator.spawnAgent(
            args.name,
            args.role,
            args.description,
            args.instructions,
          );

          logger.info(
            { teamId, agentId: agent?.id, name: args.name, role: args.role, traceId },
            'Subagent spawned',
          );

          return {
            data: {
              agentId: agent?.id,
              name: args.name,
              role: args.role,
              status: 'idle',
              message: agent ? `Agent '${args.name}' spawned successfully` : 'Failed to spawn agent',
            },
            error: null,
            metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
          };
        }

        case 'status': {
          if (!args.agentId) {
            return {
              data: null,
              error: new Error('agentId is required for status action'),
              metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
            };
          }

          const agents = coordinator.getAllAgents();
          const agent = agents.find((a) => a.id === args.agentId);

          if (!agent) {
            return {
              data: null,
              error: new Error(`Agent not found: ${args.agentId}`),
              metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
            };
          }

          return {
            data: {
              agentId: agent.id,
              name: agent.name,
              role: agent.role,
              description: agent.description,
            },
            error: null,
            metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
          };
        }

        case 'result': {
          if (!args.agentId) {
            return {
              data: null,
              error: new Error('agentId is required for result action'),
              metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
            };
          }

          const results = coordinator.aggregateResults();
          const agentId = args.agentId ?? '';
          const agentResult = results[Object.keys(results).find((k) => k.includes(agentId))] ?? null;

          return {
            data: agentResult,
            error: null,
            metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
          };
        }

        case 'terminate': {
          coordinator.terminate();
          sharedCoordinators.delete(teamId);

          logger.info({ teamId, traceId }, 'Team terminated');

          return {
            data: { message: 'All agents terminated' },
            error: null,
            metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
          };
        }

        default:
          return {
            data: null,
            error: new Error(`Unknown action: ${args.action}`),
            metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
          };
      }
    } catch (error) {
      const err = error as Error;
      logger.error({ err, traceId }, 'AgentTool execution failed');
      return {
        data: null,
        error: err,
        metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
      };
    }
  }
}
