# Implementation Plan

## Analysis Summary

**Specification:** Claude Code - a CLI tool powered by Google ADK with 40+ tools, multi-agent orchestration, terminal UI (React/Ink), and IDE bridge integration.

**Current State:** Empty `src/` directory - no implementation exists.

**Gap:** Complete greenfield implementation required.

---

## Prioritized Tasks

### Phase 1: Foundation (Infrastructure)

- [ ] **1.1** Initialize Node.js/Bun project with `package.json` and dependencies (TypeScript, Commander.js, React, Ink, Zod, Pino)
- [ ] **1.2** Set up TypeScript configuration (`tsconfig.json`) with strict mode
- [ ] **1.3** Create project directory structure per SPEC.md Appendix B
- [ ] **1.4** Set up ESLint and Prettier configuration
- [ ] **1.5** Configure logging system (Pino) with structured JSON output
- [ ] **1.6** Add `.env.example` template with required environment variables

### Phase 2: Core Agent Loop

- [ ] **2.1** Implement CLI entrypoint (`main.tsx`) with Commander.js
- [ ] **2.2** Create `QueryEngine.ts` - core query processing logic
- [ ] **2.3** Integrate Google ADK for intent understanding and decision-making
- [ ] **2.4** Implement conversation history management with context window
- [ ] **2.5** Add structured logging with trace ID propagation
- [ ] **2.6** Implement streaming response handling for terminal display

### Phase 3: Tool Execution System

- [ ] **3.1** Create base `Tool.ts` with Zod schema validation interface
- [ ] **3.2** Implement tool execution engine with timeout handling
- [ ] **3.3** Build File Operations tools: FileReadTool, FileWriteTool, FileEditTool, GlobTool, GrepTool
- [ ] **3.4** Build Shell tool: BashTool with permission-gated execution
- [ ] **3.5** Build Web tools: WebSearchTool, WebFetchTool
- [ ] **3.6** Build Task Management tools: TaskCreateTool, TaskListTool, TaskUpdateTool
- [ ] **3.7** Implement parallel and sequential tool execution patterns
- [ ] **3.8** Add tool plugin registration system for extensibility

### Phase 4: Context and Memory Management

- [ ] **4.1** Implement Context Manager for git state capture (branch, diff, commits)
- [ ] **4.2** Build file tree indexer with change detection
- [ ] **4.3** Add LSP integration for symbol-level context
- [ ] **4.4** Implement shell environment variable tracking (.env parsing)
- [ ] **4.5** Build context injection protocol with snipping for overflow
- [ ] **4.6** Create memory storage system (`memdir/` structure)
- [ ] **4.7** Implement session persistence across restarts
- [ ] **4.8** Add autoDream background memory consolidation
- [ ] **4.9** Implement sensitive data redaction for memory storage

### Phase 5: Safety and Permissions

- [ ] **5.1** Implement permission modes: ask, allow, deny, limited
- [ ] **5.2** Build bash command security validation
- [ ] **5.3** Add destructive pattern detection and blocking
- [ ] **5.4** Implement secret detection and redaction (API keys, tokens)
- [ ] **5.5** Add confirmation prompts for dangerous operations
- [ ] **5.6** Build security audit logging system
- [ ] **5.7** Implement git stash before destructive operations

### Phase 6: Terminal UI Rendering

- [ ] **6.1** Set up React/Ink rendering infrastructure
- [ ] **6.2** Implement Message component for user/assistant display
- [ ] **6.3** Build Spinner component with 60fps animation
- [ ] **6.4** Create Dialog component for confirmations and inputs
- [ ] **6.5** Implement CodeBlock with syntax highlighting
- [ ] **6.6** Build Table, ProgressBar, ErrorBanner components
- [ ] **6.7** Add ANSI color parsing and text wrapping
- [ ] **6.8** Implement keyboard shortcuts system
- [ ] **6.9** Add vim mode for text input
- [ ] **6.10** Build "More" prompt for paginated output
- [ ] **6.11** Implement BuddyDisplay ASCII companion sprite

### Phase 7: Multi-Agent Orchestration

- [ ] **7.1** Implement AgentTool for spawning subagents
- [ ] **7.2** Create coordinator mode for parent agent orchestration
- [ ] **7.3** Build SendMessageTool for inter-agent communication
- [ ] **7.4** Implement shared team memory accessible to all agents
- [ ] **7.5** Add result aggregation from subagents
- [ ] **7.6** Implement agent crash detection and reporting
- [ ] **7.7** Add maximum agent pool size enforcement

### Phase 8: Reliability and Recovery

- [ ] **8.1** Implement session state persistence after every operation
- [ ] **8.2** Build `/health` endpoint with dependency checks
- [ ] **8.3** Build `/metrics` endpoint in Prometheus format
- [ ] **8.4** Implement retry with exponential backoff for transient failures
- [ ] **8.5** Add circuit breaker pattern for external dependencies
- [ ] **8.6** Implement automatic session recovery on restart
- [ ] **8.7** Add global error handler for uncaught exceptions

### Phase 9: IDE Bridge Integration

- [ ] **9.1** Build VS Code extension WebSocket bridge protocol
- [ ] **9.2** Implement remote session connection (teleport)
- [ ] **9.3** Add trusted device OAuth flow
- [ ] **9.4** Implement terminal output mirroring to VS Code panel
- [ ] **9.5** Add file system event synchronization
- [ ] **9.6** Implement session handoff between terminal and VS Code

### Phase 10: Additional Tools and Integration

- [ ] **10.1** Build MCP tools: MCPTool (client + server)
- [ ] **10.2** Implement SkillTool for built-in skills
- [ ] **10.3** Add scheduling tools: ScheduleCronTool, CronCreate, CronDelete, CronList
- [ ] **10.4** Build TeamCreateTool, TeamDeleteTool
- [ ] **10.5** Add voice input support (voice module)

---

## Dependencies

```
Phase 1 ─┬─► Phase 2 ─┬─► Phase 3 ─┬─► Phase 4
         │            │            │
         └────────────┴──────┬─────┘
                              │
         ┌───────────────────┬┴───────────────────┐
         │                   │                   │
    Phase 5             Phase 6              Phase 7
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
                       Phase 8 ──► Phase 9 ──► Phase 10
```

---

## In Progress

<!-- Tasks currently being worked on -->

## Completed

<!-- Completed tasks (can be periodically cleaned out) -->