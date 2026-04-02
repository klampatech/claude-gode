# Implementation Plan

## Analysis Summary

**Specification:** Claude Code - a CLI tool powered by Google ADK with 40+ tools, multi-agent orchestration, terminal UI (React/Ink), and IDE bridge integration.

**Current State:** Project initialized with Phase 1-2 foundation complete. Basic CLI entrypoint, QueryEngine, logging, and Tool interface implemented.

**Gap:** Core infrastructure complete. Next: Tool implementations, context/memory management, UI rendering.

---

## Prioritized Tasks

### Phase 1: Foundation (Infrastructure) - COMPLETED

- [x] **1.1** Initialize Node.js/Bun project with `package.json` and dependencies
- [x] **1.2** Set up TypeScript configuration (`tsconfig.json`) with strict mode
- [x] **1.3** Create project directory structure per SPEC.md Appendix B
- [x] **1.4** Set up ESLint and Prettier configuration
- [x] **1.5** Configure logging system (Pino) with structured JSON output
- [x] **1.6** Add `.env.example` template with required environment variables

### Phase 2: Core Agent Loop

- [x] **2.1** Implement CLI entrypoint (`main.tsx`) with Commander.js
- [x] **2.2** Create `QueryEngine.ts` - core query processing logic
- [x] **2.3** Integrate Google ADK for intent understanding and decision-making
- [x] **2.4** Implement conversation history management with context window
- [x] **2.5** Add structured logging with trace ID propagation
- [x] **2.6** Implement streaming response handling for terminal display

### Phase 3: Tool Execution System

- [x] **3.1** Create base `Tool.ts` with Zod schema validation interface
- [x] **3.2** Implement tool execution engine with timeout handling
- [x] **3.3** Build File Operations tools: FileReadTool (implemented), FileWriteTool, FileEditTool, GlobTool, GrepTool
- [x] **3.4** Build Shell tool: BashTool with permission-gated execution
- [x] **3.5** Build Web tools: WebSearchTool, WebFetchTool
- [x] **3.6** Build Task Management tools: TaskCreateTool, TaskListTool, TaskUpdateTool
- [x] **3.7** Implement parallel and sequential tool execution patterns
- [x] **3.8** Add tool plugin registration system for extensibility

### Phase 4: Context and Memory Management

- [x] **4.1** Implement Context Manager for git state capture (branch, diff, commits) - in QueryEngine.buildContext()
- [x] **4.2** Build file tree indexer with change detection
- [x] **4.3** Add LSP integration for symbol-level context
- [x] **4.4** Implement shell environment variable tracking (.env parsing) - EnvParser in context/, integrated into QueryEngine
- [ ] **4.5** Build context injection protocol with snipping for overflow
- [x] **4.6** Create memory storage system (`memdir/` structure)
- [x] **4.7** Implement session persistence across restarts
- [x] **4.8** Add autoDream background memory consolidation
- [x] **4.9** Implement sensitive data redaction for memory storage

### Phase 5: Safety and Permissions

- [x] **5.1** Implement permission modes: ask, allow, deny, limited
- [x] **5.2** Build bash command security validation
- [x] **5.3** Add destructive pattern detection and blocking
- [x] **5.4** Implement secret detection and redaction (API keys, tokens)
- [ ] **5.5** Add confirmation prompts for dangerous operations
- [ ] **5.6** Build security audit logging system
- [ ] **5.7** Implement git stash before destructive operations

### Phase 6: Terminal UI Rendering

- [x] **6.1** Set up React/Ink rendering infrastructure
- [x] **6.2** Implement Message component for user/assistant display
- [x] **6.3** Build Spinner component with 60fps animation
- [x] **6.4** Create Dialog component for confirmations and inputs
- [x] **6.5** Implement CodeBlock with syntax highlighting
- [x] **6.6** Build Table, ProgressBar, ErrorBanner components
- [x] **6.7** Add ANSI color parsing and text wrapping
- [x] **6.8** Implement keyboard shortcuts system
- [x] **6.9** Add vim mode for text input
- [x] **6.10** Build "More" prompt for paginated output
- [x] **6.11** Implement BuddyDisplay ASCII companion sprite

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

- Phase 1: Foundation (all tasks)
- Phase 2: Core Agent Loop - 2.1, 2.2, 2.3, 2.4, 2.5, 2.6 (Google ADK integration, streaming responses, conversation history management)
- Phase 3: Tool Execution System - 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8 (WebSearchTool, WebFetchTool, TaskCreateTool, TaskListTool, TaskUpdateTool, tool plugin registration)
- Phase 4: Context and Memory Management - 4.1, 4.2, 4.3, 4.4, 4.6, 4.7, 4.8, 4.9 (FileTreeIndexer, LSP integration, EnvParser, MemoryStorage, session persistence, autoDream, redaction)
- Phase 5: Safety and Permissions - 5.1, 5.2, 5.3, 5.4 (permission modes, security validation, pattern blocking, secret redaction)
- Phase 6: Terminal UI Rendering - 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 6.11 (React/Ink, Message, Spinner, Dialog, CodeBlock, Table, ProgressBar, ErrorBanner, BuddyDisplay, MorePrompt)
