/**
 * Security service for confirmation prompts, audit logging, and destructive operation protection.
 * Handles dangerous operation confirmation, security event logging, and git stash functions.
 */

import { mkdir, appendFile, readFile } from 'fs/promises';
import { dirname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from './logger';

/** Security event types for audit logging */
export type SecurityEventType =
  | 'command_blocked'
  | 'command_confirmed'
  | 'command_executed'
  | 'confirmation_prompted'
  | 'confirmation_received'
  | 'git_stash_created'
  | 'git_stash_restored'
  | 'dangerous_operation_blocked'
  | 'permission_mode_changed'
  | 'secret_detected';

/** Security audit log entry */
export interface SecurityAuditEntry {
  id: string;
  timestamp: string;
  event_type: SecurityEventType;
  trace_id: string;
  session_id: string;
  details: Record<string, unknown>;
  success: boolean;
  user_response?: 'approved' | 'denied' | 'timeout';
}

/** Confirmation state for ongoing operations */
export interface ConfirmationState {
  trace_id: string;
  operation: string;
  details: Record<string, unknown>;
  prompted_at: string;
  expires_at: string;
  confirmed: boolean;
}

/** Git stash result */
export interface GitStashResult {
  stash_id: string;
  created: boolean;
  restored: boolean;
}

/**
 * Security service supporting confirmation prompts, audit logging, and git stash.
 */
export class SecurityService {
  private auditLogPath: string;
  private confirmations: Map<string, ConfirmationState> = new Map();
  private confirmationTimeoutMs: number;
  private maxConfirmations: number;

  constructor(options: {
    /** Path to store audit logs */
    auditLogPath?: string;
    /** Timeout for confirmation prompts in ms (default: 2 minutes) */
    confirmationTimeoutMs?: number;
    /** Maximum number of pending confirmations (default: 10) */
    maxConfirmations?: number;
  } = {}) {
    this.auditLogPath = options.auditLogPath ?? 'memdir/security-audit.log';
    this.confirmationTimeoutMs = options.confirmationTimeoutMs ?? 120000;
    this.maxConfirmations = options.maxConfirmations ?? 10;
    logger.info({ auditLogPath: this.auditLogPath }, 'SecurityService initialized');
  }

  /**
   * Log a security event to the audit log.
   */
  async logEvent(entry: Omit<SecurityAuditEntry, 'id' | 'timestamp'>): Promise<void> {
    const fullEntry: SecurityAuditEntry = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      ...entry,
    };

    try {
      // Ensure directory exists
      const dir = dirname(this.auditLogPath);
      await mkdir(dir, { recursive: true });

      // Append to log file
      const line = JSON.stringify(fullEntry) + '\n';
      await appendFile(this.auditLogPath, line, 'utf-8');

      logger.debug({ eventType: entry.event_type, traceId: entry.trace_id }, 'Security event logged');
    } catch (error) {
      logger.error({ error, eventType: entry.event_type }, 'Failed to log security event');
    }
  }

  /**
   * Create a confirmation prompt for a dangerous operation.
   * Returns a confirmation ID if confirmation is needed.
   */
  createConfirmation(options: {
    trace_id: string;
    operation: string;
    details: Record<string, unknown>;
    session_id: string;
  }): string | null {
    // Clean up expired confirmations
    this.cleanupExpiredConfirmations();

    // Check max limit
    if (this.confirmations.size >= this.maxConfirmations) {
      logger.warn({ pendingConfirmations: this.confirmations.size }, 'Max confirmations reached');
      return null;
    }

    const confirmationId = uuidv4();
    const now = new Date();
    const expires = new Date(now.getTime() + this.confirmationTimeoutMs);

    const state: ConfirmationState = {
      trace_id: options.trace_id,
      operation: options.operation,
      details: options.details,
      prompted_at: now.toISOString(),
      expires_at: expires.toISOString(),
      confirmed: false,
    };

    this.confirmations.set(confirmationId, state);

    // Log the confirmation prompt event
    this.logEvent({
      event_type: 'confirmation_prompted',
      trace_id: options.trace_id,
      session_id: options.session_id,
      details: {
        operation: options.operation,
        confirmation_id: confirmationId,
        expires_at: state.expires_at,
      },
      success: true,
    }).catch(() => {});

    logger.info({ confirmationId, operation: options.operation }, 'Confirmation prompt created');
    return confirmationId;
  }

  /**
   * Get pending confirmation details.
   */
  getConfirmation(confirmationId: string): ConfirmationState | null {
    const state = this.confirmations.get(confirmationId);
    if (!state) return null;

    // Check if expired
    if (new Date(state.expires_at) < new Date()) {
      this.confirmations.delete(confirmationId);
      return null;
    }

    return state;
  }

  /**
   * Respond to a confirmation prompt.
   */
  async respondToConfirmation(
    confirmationId: string,
    response: 'approved' | 'denied',
    session_id: string,
  ): Promise<boolean> {
    const state = this.getConfirmation(confirmationId);
    if (!state) {
      logger.warn({ confirmationId }, 'Confirmation not found or expired');
      return false;
    }

    state.confirmed = response === 'approved';

    // Log the response
    await this.logEvent({
      event_type: response === 'approved' ? 'command_confirmed' : 'dangerous_operation_blocked',
      trace_id: state.trace_id,
      session_id,
      details: {
        operation: state.operation,
        confirmation_id: confirmationId,
      },
      success: response === 'approved',
      user_response: response,
    });

    // Clean up
    this.confirmations.delete(confirmationId);

    logger.info({ confirmationId, response }, 'Confirmation responded');
    return state.confirmed;
  }

  /**
   * Check if a confirmation is required for a given operation type.
   */
  requiresConfirmation(operation: string): boolean {
    const dangerousPatterns = [
      /rm\s+-rf/,
      /git\s+push\s+--force/,
      /git\s+reset\s+--hard/,
      /DROP\s+DATABASE/i,
      /chmod\s+-R\s+777/,
      /curl\s*\|\s*sh/,
      /wget\s*\|\s*sh/,
      /sudo\s+rm/,
      /:(){ :|:& };:/,
    ];

    return dangerousPatterns.some((pattern) => pattern.test(operation));
  }

  /**
   * Create a git stash before destructive operations.
   * Returns the stash ID if created, null if no changes to stash.
   */
  async createGitStash(cwd: string, trace_id: string): Promise<GitStashResult> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    const stashId = `stash-${Date.now()}-${uuidv4().split('-')[0]}`;

    try {
      // Check if there are any changes to stash
      const { stdout: statusOutput } = await execAsync('git status --porcelain', { cwd });

      if (!statusOutput.trim()) {
        logger.info({ cwd, traceId: trace_id }, 'No changes to stash');
        return { stash_id: '', created: false, restored: false };
      }

      // Create stash with a descriptive message
      const stashMessage = `claude-code auto-stash: ${stashId} at ${new Date().toISOString()}`;
      await execAsync(`git stash push -m "${stashMessage}"`, { cwd });

      logger.info({ cwd, stashId, traceId: trace_id }, 'Git stash created');

      // Log the stash creation
      await this.logEvent({
        event_type: 'git_stash_created',
        trace_id,
        session_id: '',
        details: { cwd, stash_id: stashId },
        success: true,
      });

      return { stash_id: stashId, created: true, restored: false };
    } catch (error) {
      logger.error({ error, cwd, traceId: trace_id }, 'Failed to create git stash');
      return { stash_id: '', created: false, restored: false };
    }
  }

  /**
   * Restore a git stash.
   */
  async restoreGitStash(cwd: string, stashId: string, trace_id: string): Promise<boolean> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
      // Find the stash index
      const { stdout } = await execAsync('git stash list', { cwd });
      const lines = stdout.trim().split('\n');
      const stashEntry = lines.find((line) => line.includes(stashId));

      if (!stashEntry) {
        logger.warn({ stashId, cwd }, 'Stash not found');
        return false;
      }

      // Extract stash reference (e.g., stash@{0})
      const match = stashEntry.match(/stash@\{(\d+)\}/);
      if (!match) {
        logger.warn({ stashId, stashEntry }, 'Could not parse stash reference');
        return false;
      }

      const stashRef = `stash@{${match[1]}}`;
      await execAsync(`git stash pop ${stashRef}`, { cwd });

      logger.info({ cwd, stashRef, traceId: trace_id }, 'Git stash restored');

      // Log the stash restoration
      await this.logEvent({
        event_type: 'git_stash_restored',
        trace_id,
        session_id: '',
        details: { cwd, stash_id: stashId },
        success: true,
      });

      return true;
    } catch (error) {
      logger.error({ error, cwd, traceId: trace_id }, 'Failed to restore git stash');
      return false;
    }
  }

  /**
   * Get recent audit log entries.
   */
  async getAuditLog(limit = 100): Promise<SecurityAuditEntry[]> {
    try {
      const content = await readFile(this.auditLogPath, 'utf-8');
      const lines = content.trim().split('\n').filter(Boolean);
      const entries: SecurityAuditEntry[] = [];

      for (let i = lines.length - 1; i >= 0 && entries.length < limit; i--) {
        try {
          entries.push(JSON.parse(lines[i]));
        } catch {
          // Skip malformed lines
        }
      }

      return entries;
    } catch {
      return [];
    }
  }

  /**
   * Clean up expired confirmation prompts.
   */
  private cleanupExpiredConfirmations(): void {
    const now = new Date();
    for (const [id, state] of this.confirmations) {
      if (new Date(state.expires_at) < now) {
        this.confirmations.delete(id);
        logger.debug({ confirmationId: id }, 'Expired confirmation cleaned up');
      }
    }
  }
}

/** Default security service instance */
let defaultSecurityService: SecurityService | null = null;

/**
 * Get or create the default security service instance.
 */
export function getSecurityService(): SecurityService {
  if (!defaultSecurityService) {
    defaultSecurityService = new SecurityService({
      auditLogPath: 'memdir/security-audit.log',
    });
  }
  return defaultSecurityService;
}

/**
 * Set the default security service instance (for testing).
 */
export function setSecurityService(service: SecurityService): void {
  defaultSecurityService = service;
}