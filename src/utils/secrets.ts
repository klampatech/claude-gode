/**
 * Secret detection and redaction utilities.
 * Detects and redacts API keys, tokens, passwords, and other sensitive patterns.
 */

import { logger } from './logger';

/** Regex patterns for detecting secrets */
const SECRET_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
  // OpenAI API keys: sk-...
  { pattern: /sk-[a-zA-Z0-9]{20,}/g, name: 'openai_api_key' },
  // Anthropic API keys
  { pattern: /sk-ant-[a-zA-Z0-9_-]{20,}/g, name: 'anthropic_api_key' },
  // GitHub tokens: ghp_...
  { pattern: /ghp_[a-zA-Z0-9]{36}/g, name: 'github_token' },
  // Google API keys
  { pattern: /AIza[0-9A-Za-z_-]{35}/g, name: 'google_api_key' },
  // Generic API keys: api_key=..., api-key=...
  { pattern: /api[_-]?key\s*=\s*['"][^'"]{8,}['"]/gi, name: 'generic_api_key' },
  // Password assignments: password=...
  { pattern: /password\s*=\s*['"][^'"]{8,}['"]/gi, name: 'password' },
  // AWS Access Key ID
  { pattern: /AKIA[0-9A-Z]{16}/g, name: 'aws_access_key' },
  // AWS Secret Access Key
  { pattern: /aws_secret_access_key\s*=\s*['"][^'"]{40}['"]/gi, name: 'aws_secret_key' },
  // JWT tokens
  { pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, name: 'jwt_token' },
  // Private keys (PEM format)
  { pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, name: 'private_key' },
  // Generic bearer tokens
  { pattern: /bearer\s+[a-zA-Z0-9_-]{20,}/gi, name: 'bearer_token' },
  // Slack tokens
  { pattern: /xox[baprs]-[0-9a-zA-Z-]+/g, name: 'slack_token' },
  // Stripe API keys
  { pattern: /sk_live_[0-9a-zA-Z]{24,}/g, name: 'stripe_key' },
];

/**
 * Redact all secrets from a string.
 * @param input - The string to redact
 * @returns The string with all secrets replaced by [REDACTED]
 */
export function redactSecrets(input: string): string {
  let result = input;

  for (const { pattern, name } of SECRET_PATTERNS) {
    const matches = result.match(pattern);
    if (matches) {
      logger.debug({ pattern: name, count: matches.length }, 'Redacted secrets');
      result = result.replace(pattern, '[REDACTED]');
    }
  }

  return result;
}

/**
 * Redact secrets from an object (recursive).
 * @param obj - The object to redact
 * @param redactKeys - If true, also redact values from keys that look sensitive
 * @returns The object with secrets redacted
 */
export function redactObject(obj: unknown, redactKeys = true): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return redactSecrets(obj);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactObject(item, redactKeys));
  }

  if (typeof obj === 'object') {
    const redacted: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      let newKey = key;

      // Optionally redact keys that look sensitive
      if (redactKeys && /^(api[_-]?key|token|secret|password|credential|auth)/i.test(key)) {
        newKey = `[REDACTED]`;
      }

      redacted[newKey] = redactObject(value, redactKeys);
    }

    return redacted;
  }

  return obj;
}

/**
 * Redact sensitive environment variables from a process.env-like object.
 * @param env - Environment variables object
 * @returns Environment variables with sensitive values redacted
 */
export function redactEnv(env: Record<string, string | undefined>): Record<string, string> {
  const SENSITIVE_KEYS = [
    /api[_-]?key/i,
    /secret/i,
    /password/i,
    /token/i,
    /credential/i,
    /auth/i,
    /private/i,
  ];

  const result: Record<string, string> = {};

  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      continue;
    }

    const isSensitive = SENSITIVE_KEYS.some((pattern) => pattern.test(key));

    if (isSensitive) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Scan a string for secrets without modifying it.
 * @param input - The string to scan
 * @returns Array of detected secret types
 */
export function detectSecrets(input: string): string[] {
  const detected: string[] = [];

  for (const { pattern, name } of SECRET_PATTERNS) {
    pattern.lastIndex = 0; // Reset regex state
    if (pattern.test(input)) {
      detected.push(name);
    }
  }

  return detected;
}