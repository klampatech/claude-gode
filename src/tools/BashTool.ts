import { z } from 'zod';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { Tool, ToolContext, ToolResult } from '../Tool';
import { logger } from '../utils/logger';

const execAsync = promisify(exec);

/** Permission modes for bash execution */
export type PermissionMode = 'ask' | 'allow' | 'deny' | 'limited';

/** Patterns that are always blocked */
const BLOCKED_PATTERNS = [
  /rm\s+-rf\s+\//,
  /rm\s+-rf\s+~/,
  /DROP\s+DATABASE/i,
  /FORMAT\s+C:/i,
  /:(){ :|:& };:/, // Fork bomb
];

/** Patterns that require confirmation */
const CONFIRMATION_PATTERNS = [
  /rm\s+-rf/,
  /git\s+push\s+--force/,
  /git\s+reset\s+--hard/,
  /chmod\s+-R\s+777/,
  /curl\s*\|\s*sh/,
  /wget\s*\|\s*sh/,
  /sudo\s+rm/,
];

/** Patterns for limited mode allowlist */
const SAFE_PATTERNS = [
  /^ls/,
  /^pwd/,
  /^cd/,
  /^cat/,
  /^grep/,
  /^find/,
  /^git\s+status/,
  /^git\s+log/,
  /^git\s+diff/,
  /^git\s+checkout/,
  /^git\s+branch/,
  /^npm\s+(install|run|test)/,
  /^bun\s+(install|run|test)/,
  /^node\s+/,
  /^pnpm\s+/,
  /^yarn\s+/,
  /^echo/,
  /^mkdir/,
  /^touch/,
  /^cp\s/,
  /^mv\s/,
];

/**
 * Configuration for BashTool
 */
export interface BashToolConfig {
  /** Current permission mode */
  permissionMode: PermissionMode;
  /** Allowlist for limited mode */
  allowlist?: RegExp[];
  /** Denylist for additional blocking */
  denylist?: RegExp[];
  /** Maximum command timeout in ms */
  timeoutMs?: number;
}

/**
 * Bash tool with permission-gated command execution.
 * Validates commands against security policies before execution.
 */
export class BashTool implements Tool {
  public name = 'Bash';
  public description = 'Executes shell commands with permission gating and security validation';
  public inputSchema = z.object({
    command: z.string().describe('The shell command to execute'),
    cwd: z.string().optional().describe('Working directory for command execution'),
  });

  private config: Required<BashToolConfig>;

  constructor(config: BashToolConfig) {
    this.config = {
      permissionMode: config.permissionMode,
      allowlist: config.allowlist ?? [],
      denylist: config.denylist ?? [],
      timeoutMs: config.timeoutMs ?? 60000, // Default 60 second timeout
    };
  }

  async execute(
    input: z.infer<typeof this.inputSchema>,
    context: ToolContext,
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const command = input.command;
    const cwd = input.cwd ?? context.cwd;

    logger.info({ command, cwd, traceId: context.traceId }, 'BashTool execution requested');

    // Check permission mode
    const permissionCheck = this.checkPermission(command);
    if (!permissionCheck.allowed) {
      logger.warn(
        { command, reason: permissionCheck.reason, permissionMode: this.config.permissionMode },
        'Command blocked by permission system',
      );
      return {
        data: null,
        error: new Error(`Command blocked: ${permissionCheck.reason}`),
        metadata: {
          duration_ms: Date.now() - startTime,
          trace_id: context.traceId,
        },
      };
    }

    // Check if confirmation is required
    if (permissionCheck.requiresConfirmation && this.config.permissionMode === 'ask') {
      // In ask mode, return a special result indicating confirmation is needed
      return {
        data: null,
        error: new Error(`CONFIRMATION_REQUIRED: ${permissionCheck.reason}`),
        metadata: {
          duration_ms: Date.now() - startTime,
          trace_id: context.traceId,
        },
      };
    }

    // Execute the command
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd,
        timeout: this.config.timeoutMs,
        maxBuffer: 10 * 1024 * 1024, // 10MB max output
      });

      const result = {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: 0,
      };

      logger.info(
        { command, exitCode: 0, durationMs: Date.now() - startTime, traceId: context.traceId },
        'Command executed successfully',
      );

      return {
        data: result,
        error: null,
        metadata: {
          duration_ms: Date.now() - startTime,
          trace_id: context.traceId,
        },
      };
    } catch (error) {
      const err = error as { stdout?: string; stderr?: string; code?: number; kill?: boolean; timedOut?: boolean };

      // Handle timeout
      if (err.timedOut) {
        logger.error({ command, timeout: this.config.timeoutMs }, 'Command timed out');
        return {
          data: null,
          error: new Error(`Command timed out after ${this.config.timeoutMs}ms`),
          metadata: {
            duration_ms: Date.now() - startTime,
            trace_id: context.traceId,
          },
        };
      }

      const result = {
        stdout: err.stdout?.trim() ?? '',
        stderr: err.stderr?.trim() ?? '',
        exitCode: err.code ?? 1,
      };

      logger.warn(
        { command, exitCode: result.exitCode, stderr: result.stderr, traceId: context.traceId },
        'Command failed',
      );

      return {
        data: result,
        error: new Error(`Command exited with code ${result.exitCode}: ${result.stderr}`),
        metadata: {
          duration_ms: Date.now() - startTime,
          trace_id: context.traceId,
        },
      };
    }
  }

  /**
   * Check if a command is allowed to run
   */
  private checkPermission(command: string): {
    allowed: boolean;
    requiresConfirmation: boolean;
    reason: string;
  } {
    const trimmedCommand = command.trim();

    // Deny mode blocks all commands
    if (this.config.permissionMode === 'deny') {
      return {
        allowed: false,
        requiresConfirmation: false,
        reason: 'Bash execution is disabled in deny mode',
      };
    }

    // Allow mode permits all commands
    if (this.config.permissionMode === 'allow') {
      return {
        allowed: true,
        requiresConfirmation: false,
        reason: 'Allowed by permission mode',
      };
    }

    // Check blocked patterns
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(trimmedCommand)) {
        return {
          allowed: false,
          requiresConfirmation: false,
          reason: `Command matches blocked pattern: ${pattern.source}`,
        };
      }
    }

    // Check custom denylist
    for (const pattern of this.config.denylist) {
      if (pattern.test(trimmedCommand)) {
        return {
          allowed: false,
          requiresConfirmation: false,
          reason: `Command matches denylist pattern: ${pattern.source}`,
        };
      }
    }

    // Limited mode requires allowlist check
    if (this.config.permissionMode === 'limited') {
      const isAllowedByList = SAFE_PATTERNS.some((p) => p.test(trimmedCommand));
      const isAllowedByCustom = this.config.allowlist.some((p) => p.test(trimmedCommand));

      if (!isAllowedByList && !isAllowedByCustom) {
        return {
          allowed: false,
          requiresConfirmation: true,
          reason: 'Command requires confirmation in limited mode - not in allowlist',
        };
      }
    }

    // Check confirmation patterns for ask mode
    if (this.config.permissionMode === 'ask') {
      for (const pattern of CONFIRMATION_PATTERNS) {
        if (pattern.test(trimmedCommand)) {
          return {
            allowed: true,
            requiresConfirmation: true,
            reason: `Command requires confirmation: ${pattern.source}`,
          };
        }
      }
    }

    return {
      allowed: true,
      requiresConfirmation: false,
      reason: 'Command allowed',
    };
  }

  /**
   * Update permission mode at runtime
   */
  setPermissionMode(mode: PermissionMode): void {
    this.config.permissionMode = mode;
    logger.info({ permissionMode: mode }, 'Permission mode updated');
  }

  /**
   * Get current permission mode
   */
  getPermissionMode(): PermissionMode {
    return this.config.permissionMode;
  }

  /**
   * Add command to allowlist
   */
  addToAllowlist(pattern: RegExp): void {
    this.config.allowlist.push(pattern);
    logger.debug({ pattern: pattern.source }, 'Added to allowlist');
  }

  /**
   * Add command to denylist
   */
  addToDenylist(pattern: RegExp): void {
    this.config.denylist.push(pattern);
    logger.debug({ pattern: pattern.source }, 'Added to denylist');
  }
}
