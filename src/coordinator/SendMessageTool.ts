/**
 * SendMessageTool - Tool for inter-agent communication in multi-agent orchestration
 */

import { z } from 'zod';
import { logger } from '../utils/logger.js';
import type { Tool, ToolContext, ToolResult } from '../Tool.js';
import { AgentCoordinator } from './types.js';

/**
 * Input schema for SendMessageTool
 */
export const SendMessageToolInputSchema = z.object({
  fromAgentId: z.string().describe('ID of the sending agent'),
  toAgentId: z.string().describe('ID of the receiving agent, or "broadcast" for all'),
  type: z.enum(['request', 'response', 'event', 'error']).describe('Message type'),
  payload: z.unknown().describe('Message payload content'),
  replyTo: z.string().optional().describe('Message ID this is replying to'),
});

export type SendMessageToolInput = z.infer<typeof SendMessageToolInputSchema>;

/**
 * Shared coordinator map - singleton for cross-tool coordination
 */
const sharedCoordinators: Map<string, AgentCoordinator> = new Map();

function getOrCreateCoordinator(teamId: string): AgentCoordinator {
  let coordinator = sharedCoordinators.get(teamId);
  if (!coordinator) {
    coordinator = new AgentCoordinator(teamId);
    sharedCoordinators.set(teamId, coordinator);
  }
  return coordinator;
}

/**
 * Tool for inter-agent communication
 */
export class SendMessageTool implements Tool {
  public name = 'SendMessage';
  public description = 'Send messages between agents in a team';
  public inputSchema = SendMessageToolInputSchema;

  async execute(input: unknown, context: ToolContext): Promise<ToolResult> {
    const startTime = Date.now();
    const traceId = context.traceId;

    try {
      const args = input as SendMessageToolInput;
      const sessionId = context.sessionId ?? 'default';
      const teamId = `team-${sessionId}`;
      const coordinator = getOrCreateCoordinator(teamId);

      // Validate from agent exists
      const fromAgent = coordinator.getAllAgents().find((a) => a.id === args.fromAgentId);
      if (!fromAgent) {
        return {
          data: null,
          error: new Error(`Sending agent not found: ${args.fromAgentId}`),
          metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
        };
      }

      // Send the message
      const message = coordinator.sendMessage(
        args.fromAgentId,
        args.toAgentId,
        args.type,
        args.payload,
        args.replyTo,
      );

      if (!message) {
        return {
          data: null,
          error: new Error('Failed to send message'),
          metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
        };
      }

      logger.info(
        {
          teamId: `team-${sessionId}`,
          from: args.fromAgentId,
          to: args.toAgentId,
          type: args.type,
          messageId: message.id,
          traceId,
        },
        'Inter-agent message sent',
      );

      return {
        data: {
          messageId: message.id,
          from: args.fromAgentId,
          to: args.toAgentId,
          type: args.type,
          timestamp: message.timestamp,
          deliveryConfirmed: true,
        },
        error: null,
        metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
      };
    } catch (error) {
      const err = error as Error;
      logger.error({ err, traceId }, 'SendMessageTool execution failed');
      return {
        data: null,
        error: err,
        metadata: { duration_ms: Date.now() - startTime, trace_id: traceId },
      };
    }
  }
}
