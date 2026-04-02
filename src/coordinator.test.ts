import { describe, it, expect, beforeEach } from 'bun:test';
import { AgentTool } from './coordinator/AgentTool';
import { SendMessageTool } from './coordinator/SendMessageTool';
import { TeamCreateTool } from './coordinator/TeamCreateTool';
import { TeamDeleteTool } from './coordinator/TeamDeleteTool';
import { createToolContext } from './ToolExecutor';
import { v4 as uuidv4 } from 'uuid';

describe('Coordinator Tools', () => {
  let context: ReturnType<typeof createToolContext>;
  let sessionId: string;

  beforeEach(() => {
    sessionId = uuidv4();
    context = createToolContext({
      cwd: '/tmp/test',
      env: {},
      sessionId,
      traceId: uuidv4(),
    });
  });

  describe('AgentTool', () => {
    let agentTool: AgentTool;

    beforeEach(() => {
      agentTool = new AgentTool();
    });

    it('should spawn a subagent', async () => {
      const result = await agentTool.execute(
        {
          action: 'spawn',
          name: 'researcher-1',
          role: 'researcher',
          description: 'Research files',
          instructions: 'Find relevant files',
        },
        context,
      );

      expect(result.error).toBeNull();
      const data = result.data as { agentId: string; name: string; role: string; status: string };
      expect(data.agentId).toBeDefined();
      expect(data.name).toBe('researcher-1');
      expect(data.role).toBe('researcher');
      expect(data.status).toBe('idle');
    });

    it('should return error when spawning without name', async () => {
      const result = await agentTool.execute(
        {
          action: 'spawn',
          role: 'researcher',
        },
        context,
      );

      expect(result.error).not.toBeNull();
      expect(result.error?.message).toContain('name');
    });

    it('should enforce pool limit', async () => {
      const toolWithLimit = new AgentTool();
      // First spawn should work
      const result1 = await toolWithLimit.execute(
        { action: 'spawn', name: 'agent-1', role: 'coder', maxAgents: 1 },
        context,
      );
      expect(result1.error).toBeNull();

      // Try to spawn again in same session - should hit limit
      const result2 = await toolWithLimit.execute(
        { action: 'spawn', name: 'agent-2', role: 'coder', maxAgents: 1 },
        context,
      );
      expect(result2.error).not.toBeNull();
      expect(result2.error?.message).toContain('limit');
    });

    it('should terminate all agents', async () => {
      const result = await agentTool.execute({ action: 'terminate' }, context);

      expect(result.error).toBeNull();
      expect(result.data).toEqual({ message: 'All agents terminated' });
    });
  });

  describe('SendMessageTool', () => {
    it('should fail for non-existent sender', async () => {
      const sendMessageTool = new SendMessageTool();
      const result = await sendMessageTool.execute(
        {
          fromAgentId: 'non-existent-id',
          toAgentId: 'broadcast',
          type: 'request',
          payload: { test: true },
        },
        context,
      );

      expect(result.error).not.toBeNull();
      expect(result.error?.message).toContain('not found');
    });
  });

  describe('TeamCreateTool', () => {
    let teamCreateTool: TeamCreateTool;

    beforeEach(() => {
      teamCreateTool = new TeamCreateTool();
    });

    it('should create a team', async () => {
      const result = await teamCreateTool.execute(
        {
          teamName: 'test-team',
          maxAgents: 5,
        },
        context,
      );

      expect(result.error).toBeNull();
      const data = result.data as { teamId: string; teamName: string; maxAgents: number; agents: unknown[] };
      expect(data.teamId).toBe('team-test-team');
      expect(data.teamName).toBe('test-team');
      expect(data.maxAgents).toBe(5);
      expect(data.agents).toEqual([]);
    });

    it('should create team with initial agents', async () => {
      const result = await teamCreateTool.execute(
        {
          teamName: 'migration-team',
          maxAgents: 10,
          initialAgents: [
            { name: 'backend-agent', role: 'coder', description: 'Handle backend' },
            { name: 'frontend-agent', role: 'coder', description: 'Handle frontend' },
          ],
        },
        context,
      );

      expect(result.error).toBeNull();
      const data = result.data as { agents: Array<{ name: string; role: string }> };
      expect(data.agents).toHaveLength(2);
      expect(data.agents[0].name).toBe('backend-agent');
      expect(data.agents[1].name).toBe('frontend-agent');
    });

    it('should prevent duplicate team names', async () => {
      await teamCreateTool.execute({ teamName: 'dup-team' }, context);

      const result = await teamCreateTool.execute({ teamName: 'dup-team' }, context);

      expect(result.error).not.toBeNull();
      expect(result.error?.message).toContain('already exists');
    });
  });

  describe('TeamDeleteTool', () => {
    it('should fail for non-existent team', async () => {
      const teamDeleteTool = new TeamDeleteTool();
      const result = await teamDeleteTool.execute({ teamName: 'non-existent' }, context);

      expect(result.error).not.toBeNull();
      expect(result.error?.message).toContain('does not exist');
    });
  });
});
