/**
 * Agent types and interfaces for multi-agent orchestration
 */

import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

export type AgentStatus = 'idle' | 'working' | 'completed' | 'failed' | 'crashed';

export type AgentRole = 'coordinator' | 'researcher' | 'coder' | 'reviewer' | 'custom';

export interface SubAgentConfig {
  id: string;
  name: string;
  role: AgentRole;
  description?: string;
  instructions?: string;
  context?: Record<string, unknown>;
}

export interface AgentMessage {
  id: string;
  from: string;
  to: string | 'broadcast';
  type: 'request' | 'response' | 'event' | 'error';
  payload: unknown;
  replyTo?: string;
  timestamp: string;
}

export interface TeamMemory {
  teamId: string;
  agents: Map<string, SubAgentConfig>;
  messages: AgentMessage[];
  sharedContext: Record<string, unknown>;
}

/**
 * Agent pool for managing subagents
 */
export class AgentPool {
  private agents: Map<string, SubAgentConfig> = new Map();
  private status: Map<string, AgentStatus> = new Map();
  private results: Map<string, unknown> = new Map();
  private maxPoolSize: number;

  constructor(maxPoolSize: number = 10) {
    this.maxPoolSize = maxPoolSize;
  }

  addAgent(config: SubAgentConfig): boolean {
    if (this.agents.size >= this.maxPoolSize) {
      logger.warn({ maxPoolSize: this.maxPoolSize }, 'Agent pool limit reached');
      return false;
    }
    this.agents.set(config.id, config);
    this.status.set(config.id, 'idle');
    logger.info({ agentId: config.id, role: config.role }, 'Agent added to pool');
    return true;
  }

  removeAgent(agentId: string): boolean {
    const agent = this.agents.get(agentId);
    if (!agent) return false;
    this.agents.delete(agentId);
    this.status.delete(agentId);
    this.results.delete(agentId);
    logger.info({ agentId }, 'Agent removed from pool');
    return true;
  }

  getAgent(agentId: string): SubAgentConfig | undefined {
    return this.agents.get(agentId);
  }

  getAllAgents(): SubAgentConfig[] {
    return Array.from(this.agents.values());
  }

  setStatus(agentId: string, status: AgentStatus): void {
    this.status.set(agentId, status);
    logger.debug({ agentId, status }, 'Agent status updated');
  }

  getStatus(agentId: string): AgentStatus | undefined {
    return this.status.get(agentId);
  }

  setResult(agentId: string, result: unknown): void {
    this.results.set(agentId, result);
  }

  getResult(agentId: string): unknown | undefined {
    return this.results.get(agentId);
  }

  getPoolSize(): number {
    return this.agents.size;
  }

  isAtLimit(): boolean {
    return this.agents.size >= this.maxPoolSize;
  }

  clear(): void {
    this.agents.clear();
    this.status.clear();
    this.results.clear();
  }
}

/**
 * Team memory for sharing context between agents
 */
export class TeamMemoryStore {
  private teams: Map<string, TeamMemory> = new Map();

  createTeam(teamId: string): TeamMemory {
    const team: TeamMemory = {
      teamId,
      agents: new Map(),
      messages: [],
      sharedContext: {},
    };
    this.teams.set(teamId, team);
    logger.info({ teamId }, 'Team created');
    return team;
  }

  getTeam(teamId: string): TeamMemory | undefined {
    return this.teams.get(teamId);
  }

  deleteTeam(teamId: string): boolean {
    return this.teams.delete(teamId);
  }

  addAgentToTeam(teamId: string, agent: SubAgentConfig): boolean {
    const team = this.teams.get(teamId);
    if (!team) return false;
    team.agents.set(agent.id, agent);
    return true;
  }

  removeAgentFromTeam(teamId: string, agentId: string): boolean {
    const team = this.teams.get(teamId);
    if (!team) return false;
    return team.agents.delete(agentId);
  }

  addMessage(teamId: string, message: AgentMessage): boolean {
    const team = this.teams.get(teamId);
    if (!team) return false;
    team.messages.push(message);
    return true;
  }

  getMessages(teamId: string): AgentMessage[] {
    const team = this.teams.get(teamId);
    return team?.messages ?? [];
  }

  updateSharedContext(teamId: string, context: Record<string, unknown>): boolean {
    const team = this.teams.get(teamId);
    if (!team) return false;
    team.sharedContext = { ...team.sharedContext, ...context };
    return true;
  }

  getSharedContext(teamId: string): Record<string, unknown> {
    const team = this.teams.get(teamId);
    return team?.sharedContext ?? {};
  }
}

/**
 * AgentCoordinator for managing multi-agent orchestration
 */
export class AgentCoordinator {
  private pool: AgentPool;
  private teamMemory: TeamMemoryStore;
  private teamId: string;
  private parentContext: Record<string, unknown>;

  constructor(teamId: string, maxPoolSize: number = 10, parentContext: Record<string, unknown> = {}) {
    this.teamId = teamId;
    this.pool = new AgentPool(maxPoolSize);
    this.teamMemory = new TeamMemoryStore();
    this.parentContext = parentContext;
    this.teamMemory.createTeam(teamId);
  }

  /**
   * Spawn a subagent with specified role and context
   */
  spawnAgent(name: string, role: AgentRole, description?: string, instructions?: string): SubAgentConfig | null {
    const agent: SubAgentConfig = {
      id: uuidv4(),
      name,
      role,
      description,
      instructions,
      context: { ...this.parentContext },
    };

    if (this.pool.addAgent(agent)) {
      this.teamMemory.addAgentToTeam(this.teamId, agent);
      return agent;
    }
    return null;
  }

  /**
   * Send a message to another agent or broadcast
   */
  sendMessage(
    fromAgentId: string,
    toAgentId: string | 'broadcast',
    type: AgentMessage['type'],
    payload: unknown,
    replyTo?: string,
  ): AgentMessage | null {
    const fromAgent = this.pool.getAgent(fromAgentId);
    if (!fromAgent) return null;

    const message: AgentMessage = {
      id: uuidv4(),
      from: fromAgentId,
      to: toAgentId,
      type,
      payload,
      replyTo,
      timestamp: new Date().toISOString(),
    };

    this.teamMemory.addMessage(this.teamId, message);

    if (toAgentId !== 'broadcast') {
      const toAgent = this.pool.getAgent(toAgentId);
      if (!toAgent) return null;
    }

    logger.info({ from: fromAgentId, to: toAgentId, type }, 'Agent message sent');
    return message;
  }

  /**
   * Get all messages for an agent
   */
  getMessagesForAgent(agentId: string): AgentMessage[] {
    return this.teamMemory.getMessages(this.teamId).filter(
      (msg) => msg.to === agentId || msg.to === 'broadcast' || msg.from === agentId,
    );
  }

  /**
   * Update agent status
   */
  setAgentStatus(agentId: string, status: AgentStatus): void {
    this.pool.setStatus(agentId, status);
  }

  /**
   * Set agent result
   */
  setAgentResult(agentId: string, result: unknown): void {
    this.pool.setResult(agentId, result);
    this.teamMemory.updateSharedContext(this.teamId, { [`${agentId}_result`]: result });
  }

  /**
   * Get aggregated results from all agents
   */
  aggregateResults(): Record<string, unknown> {
    const agents = this.pool.getAllAgents();
    const results: Record<string, unknown> = {};

    for (const agent of agents) {
      const result = this.pool.getResult(agent.id);
      if (result !== undefined) {
        results[agent.name] = result;
      }
    }

    return results;
  }

  /**
   * Get team memory
   */
  getTeamMemory(): Record<string, unknown> {
    return this.teamMemory.getSharedContext(this.teamId);
  }

  /**
   * Check if agent crashed
   */
  handleAgentCrash(agentId: string, error: Error): void {
    this.pool.setStatus(agentId, 'crashed');
    this.sendMessage(agentId, 'broadcast', 'error', { error: error.message, agentId });
    logger.error({ agentId, error: error.message }, 'Agent crashed');
  }

  /**
   * Terminate all agents
   */
  terminate(): void {
    this.pool.clear();
    this.teamMemory.deleteTeam(this.teamId);
    logger.info({ teamId: this.teamId }, 'Team terminated');
  }

  /**
   * Get pool size
   */
  getPoolSize(): number {
    return this.pool.getPoolSize();
  }

  /**
   * Check if at pool limit
   */
  isAtPoolLimit(): boolean {
    return this.pool.isAtLimit();
  }

  /**
   * Get all agents
   */
  getAllAgents(): SubAgentConfig[] {
    return this.pool.getAllAgents();
  }
}
