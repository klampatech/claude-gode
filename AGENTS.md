## Build & Run

Succinct rules for how to BUILD the project:

```bash
# Install dependencies (Bun preferred, Node.js 18+ fallback)
bun install

# Build TypeScript
bun run build

# Development mode with watch
bun run dev

# Run tests
bun test

# Typecheck
bun run typecheck

# Lint
bun run lint
```

## Validation

Run these after implementing to get immediate feedback:

- Tests: `bun test`
- Typecheck: `bun run typecheck`
- Lint: `bun run lint`

## Operational Notes

- **Runtime**: Bun (primary), Node.js v18+ (fallback)
- **Entry point**: `src/main.tsx`
- **Memory dir**: `memdir/` (created automatically, gitignored)
- **Session persistence**: State saved to `memdir/sessions/` after each operation
- **Context window**: Configurable via `CLAUDE_CONTEXT_WINDOW` env var (default: 100 messages)

### Key Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CLAUDE_API_KEY` | required | Google ADK API key |
| `CLAUDE_PROJECT_PATH` | cwd | Project directory to operate on |
| `CLAUDE_CONTEXT_WINDOW` | 100 | Max messages in context |
| `CLAUDE_PERMISSION_MODE` | ask | Permission mode: ask/allow/deny/limited |
| `LOG_LEVEL` | info | Logging level: debug/info/warn/error |

---

## Codebase Patterns

### Tool Implementation

Every tool extends the base `Tool` interface with Zod input schema:

```typescript
import { z } from 'zod';
import type { Tool } from '../Tool';

export class FileReadTool implements Tool {
  public name = 'FileRead';
  public description = 'Reads file contents';

  public inputSchema = z.object({
    path: z.string().describe('Absolute path to file'),
  });

  async execute(input: z.infer<typeof this.inputSchema>, ctx: ToolContext) {
    // Full project context available via ctx (git state, cwd, env)
    return { data: readFile(input.path), error: null, metadata: {} };
  }
}
```

### Result Envelope

All tools return a consistent envelope:

```typescript
interface ToolResult {
  data: unknown;       // Success data
  error: Error | null;  // null on success
  metadata: {
    duration_ms: number;
    trace_id: string;
  };
}
```

### State Management

Session state uses a Zustand-like store pattern. State is persisted after every mutation via the `persistMiddleware`.

### Context Injection

Build context at each turn via:

```typescript
const ctx = await buildContext(session);
// Returns: { git_state, file_tree, lsp_symbols, env_vars, memories, session_mem }
```

### Multi-Agent Coordination

Coordinator spawns subagents via `AgentTool`, communicates via `SendMessageTool`, and aggregates results. Team memory is shared via `memdir/team/{team-id}/`.

---

## Directory Structure

```
src/
├── main.tsx                    # CLI entrypoint (Commander.js)
├── QueryEngine.ts              # Core query processing
├── Tool.ts                     # Base tool interface
├── ToolExecutor.ts             # Tool execution engine with timeout handling
├── tools/                      # 40+ tool implementations
│   ├── FileReadTool.ts
│   ├── FileWriteTool.ts
│   ├── FileEditTool.ts
│   ├── GlobTool.ts
│   ├── GrepTool.ts
│   └── BashTool.ts
├── services/                   # Backend services (MCP, OAuth)
├── coordinator/                # Multi-agent orchestration
├── bridge/                     # IDE integration (VS Code)
├── components/                 # React components
├── ink/                        # React/Ink renderer
├── context/                    # Context providers
├── memdir/                     # Memory storage
├── schemas/                    # Zod schemas
└── server/                     # Health/metrics endpoints
```
