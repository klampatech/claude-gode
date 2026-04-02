import { Command } from 'commander';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { logger } from './utils/logger.js';
import { QueryEngine } from './QueryEngine.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { setupGlobalErrorHandlers, createEngineCleanup } from './utils/globalErrorHandlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CliOptions {
  projectPath?: string;
  contextWindow?: number;
  permissionMode?: 'ask' | 'allow' | 'deny' | 'limited';
  logLevel?: string;
  restoreSession?: string;
}

async function loadEnv(): Promise<void> {
  try {
    const envPath = resolve(__dirname, '../.env');
    const { parse } = await import('dotenv');
    const envContent = await readFile(envPath, 'utf-8');
    const envVars = parse(envContent);

    for (const [key, value] of Object.entries(envVars)) {
      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // .env file is optional
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const engineRef: { engine: QueryEngine | null } = { engine: null };

  // Set up global error handlers with cleanup
  setupGlobalErrorHandlers({
    cleanup: createEngineCleanup(engineRef as { engine: { persistSession: () => Promise<void> } }),
  });

  const startCli = async () => {
    const program = new Command();

    program
      .name('claude')
      .description(
        'CLI tool powered by Google ADK with 40+ tools, multi-agent orchestration, terminal UI (React/Ink), and IDE bridge integration',
      )
      .version('0.0.0')
      .option(
        '-p, --project-path <path>',
        'Project directory to operate on',
        process.cwd(),
      )
      .option(
        '-c, --context-window <number>',
        'Max messages in context window',
        '100',
      )
      .option(
        '-m, --permission-mode <mode>',
        'Permission mode: ask, allow, deny, limited',
        'ask',
      )
      .option(
        '-l, --log-level <level>',
        'Logging level: debug, info, warn, error',
        'info',
      )
      .option(
        '-r, --restore-session <session-id>',
        'Restore a previous session by ID',
      )
      .argument('[prompt]', 'Initial prompt to send to Claude')
      .action(async (prompt: string | undefined, options: CliOptions) => {
        await loadEnv();

        const contextWindow = parseInt(String(options.contextWindow ?? '100'), 10);
        const permissionMode = options.permissionMode as
          | 'ask'
          | 'allow'
          | 'deny'
          | 'limited';

        process.env.LOG_LEVEL = options.logLevel ?? 'info';
        process.env.CLAUDE_PROJECT_PATH = options.projectPath ?? process.cwd();
        process.env.CLAUDE_CONTEXT_WINDOW = contextWindow.toString();
        process.env.CLAUDE_PERMISSION_MODE = permissionMode;

        const engine = new QueryEngine({
          projectPath: options.projectPath ?? process.cwd(),
          contextWindow,
          permissionMode,
          restoreSessionId: options.restoreSession,
        });

        // Make engine available for cleanup handlers
        engineRef.engine = engine;

        // Initialize the engine (sets up memory storage and optionally restores session)
        await engine.initialize();

        if (prompt) {
          await engine.processQuery(prompt);
        } else {
          // Interactive mode - start REPL
          await engine.startInteractive();
        }
      });

    await program.parseAsync(process.argv);
  };

  startCli()
    .then(() => {
      logger.info('CLI completed');
    })
    .catch((error) => {
      logger.error({ err: error }, 'Fatal error');
      process.exit(1);
    });
}
