import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { existsSync } from 'fs';
import { logger } from '../utils/logger';
import { redact } from '../utils/secrets';

/**
 * Parsed environment variable
 */
export interface EnvVariable {
  key: string;
  value: string;
  isSecret: boolean;
}

/**
 * Environment parser for project context.
 * Parses .env files and extracts relevant environment variables.
 */
export class EnvParser {
  private projectPath: string;
  private cachedVars: Map<string, EnvVariable[]> = new Map();

  constructor(projectPath: string) {
    this.projectPath = projectPath;
  }

  /**
   * Find and parse all .env files in the project directory
   * Looks for: .env, .env.local, .env.development, .env.production, .env.{branch}
   */
  async parseEnvFiles(): Promise<EnvVariable[]> {
    const cacheKey = this.projectPath;
    const cached = this.cachedVars.get(cacheKey);
    if (cached) {
      return cached;
    }

    const envFiles = [
      '.env',
      '.env.local',
      '.env.development',
      '.env.production',
      '.env.test',
      '.env.staging',
    ];

    const allVars: EnvVariable[] = [];

    for (const envFile of envFiles) {
      const envPath = resolve(this.projectPath, envFile);
      if (existsSync(envPath)) {
        try {
          const content = await readFile(envPath, 'utf-8');
          const vars = this.parseEnvContent(content, envFile);
          allVars.push(...vars);
          logger.debug({ envFile, varCount: vars.length }, 'Parsed env file');
        } catch (error) {
          logger.warn({ envFile, err: error }, 'Failed to parse env file');
        }
      }
    }

    // Deduplicate by key (later files override earlier ones)
    const uniqueVars = this.deduplicateVars(allVars);
    this.cachedVars.set(cacheKey, uniqueVars);

    return uniqueVars;
  }

  /**
   * Parse a single .env file content
   */
  parseEnvContent(content: string, _source: string): EnvVariable[] {
    const vars: EnvVariable[] = [];
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Parse KEY=VALUE format
      const equalIndex = trimmed.indexOf('=');
      if (equalIndex === -1) {
        continue;
      }

      const key = trimmed.substring(0, equalIndex).trim();
      let value = trimmed.substring(equalIndex + 1).trim();

      // Remove quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }

      const isSecret = this.isSecretKey(key);
      vars.push({
        key,
        value: isSecret ? redact(value) : value,
        isSecret,
      });
    }

    return vars;
  }

  /**
   * Determine if a key represents a secret
   */
  private isSecretKey(key: string): boolean {
    const secretPatterns = [
      /^(API| secret | token | key | password | secret | credential | private)/i,
      /(API|SECRET|TOKEN|KEY|PASSWORD|SECRET|CREDENTIAL|PRIVATE)_?KEY$/i,
      /^DB_(PASS PASSWORD|HOST|USER)/i,
      /^AWS_(SECRET|ACCESS)/i,
      /^GOOGLE_(SECRET|API_KEY)/i,
      /^ANTHROPIC_(API_KEY|KEY)/i,
      /^STRIPE_(SECRET|KEY)/i,
      /^JWT_SECRET$/i,
      /^SESSION_SECRET$/i,
    ];

    return secretPatterns.some(pattern => pattern.test(key));
  }

  /**
   * Deduplicate environment variables (later entries override earlier ones)
   */
  private deduplicateVars(vars: EnvVariable[]): EnvVariable[] {
    const seen = new Map<string, EnvVariable>();

    for (const v of vars) {
      // Only keep non-secret if we have both
      const existing = seen.get(v.key);
      if (existing && existing.isSecret && !v.isSecret) {
        seen.set(v.key, v);
      } else if (!existing || (existing.isSecret && !v.isSecret)) {
        seen.set(v.key, v);
      }
    }

    return Array.from(seen.values());
  }

  /**
   * Format environment variables for context injection
   */
  async getFormattedForContext(maxVars: number = 20): Promise<string> {
    const vars = await this.parseEnvFiles();

    // Filter to non-secret vars for context
    const publicVars = vars.filter(v => !v.isSecret).slice(0, maxVars);

    if (publicVars.length === 0) {
      return 'No environment variables found';
    }

    const lines = publicVars.map(v => `${v.key}=${v.value}`);
    return lines.join('\n');
  }

  /**
   * Clear the cache to force re-parsing
   */
  clearCache(): void {
    this.cachedVars.clear();
  }
}