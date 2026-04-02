# Claude Code Specification

## Table of Contents

1. [Overview and Goals](#1-overview-and-goals)
2. [Agent Core Loop with Google ADK](#2-agent-core-loop-with-google-adk)
3. [Tool Execution System](#3-tool-execution-system)
4. [Context and Memory Management](#4-context-and-memory-management)
5. [Multi-Agent Orchestration](#5-multi-agent-orchestration)
6. [Safety and Permission Boundaries](#6-safety-and-permission-boundaries)
7. [Terminal UI Rendering](#7-terminal-ui-rendering)
8. [IDE Bridge Integration](#8-ide-bridge-integration)
9. [Reliability and Crash Recovery](#9-reliability-and-crash-recovery)
10. [Definition of Done](#10-definition-of-done)

---

## 1. Overview and Goals

### 1.1 Problem Statement

Software developers need AI assistance that stays embedded in their terminal and IDE workflow without context switching. Existing AI coding tools require developers to leave their environment — copying code, switching to a web interface, pasting context, and then returning. Claude Code bridges this gap by deeply integrating with the filesystem, git, shell environment, LSP, and IDE, making AI assistance feel like a natural extension of the terminal rather than a separate application. The challenge is maintaining full project context (git state, file structure, LSP symbols, shell environment) across complex, multi-file tasks while keeping the developer in control and the system safe.

### 1.2 Goals

- Execute complex multi-file refactors, debugging sessions, and code generation while maintaining full project context
- Remain responsive and accurate under increased project complexity — large codebases, long histories, concurrent operations
- Prevent unsafe actions (destructive commands, secret exposure, state corruption) while respecting developer intent
- Provide a terminal-native experience that developers never need to leave
- Support multi-agent collaboration for tasks that benefit from parallel or specialized execution

### 1.3 Scope

**In scope:**
- Agent core loop powered by Google ADK for intent understanding and decision-making
- Tool execution system with 40+ tools (Bash, Files, LSP, Web, Tasks, Teams, MCP)
- Context and memory management maintaining git state, file structure, LSP symbols, shell environment
- Multi-agent orchestration with coordinator mode for swarm coordination
- Safety and permission system with permission modes and security policies
- Terminal UI using React/Ink for CLI rendering
- IDE bridge integration for VS Code extension and remote sessions
- Reliability patterns including crash recovery, session resumption, and graceful degradation

**Out of scope:**
- Web-based UI (this is a CLI-first tool)
- Direct database access (uses SQLite via migrations)
- Cloud hosting/deployment infrastructure
- Mobile or tablet interfaces

### 1.4 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        CLI Entrypoint                        │
│                    (Commander.js + React/Ink)                │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     Agent Core (Google ADK)                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ QueryEngine │  │ Tool Router │  │ Context Manager     │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────┐
│  Tool Executor  │ │  Agent Pool    │ │  Memory System     │
│  (40+ tools)    │ │  (Coordinator) │ │  (Session + Dream) │
└─────────────────┘ └─────────────────┘ └─────────────────────┘
          │                   │                   │
          ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────────┐
│ Safety Layer   │ │  IDE Bridge    │ │  Terminal UI        │
│ (Permissions)  │ │  (VS Code)     │ │  (React/Ink)        │
└─────────────────┘ └─────────────────┘ └─────────────────────┘
```

---

## 2. Agent Core Loop with Google ADK

### 2.1 Description

The agent core loop is the central execution engine that drives Claude Code's behavior. It receives user input, leverages Google ADK for intent understanding and reasoning, maintains context across the conversation, selects and executes appropriate tools, and returns results to the user. The loop is designed to be resilient, observable, and controllable at every step.

### 2.2 User Journey

1. Developer types a request in the terminal
2. Input is parsed and routed to the QueryEngine
3. Google ADK model analyzes intent, project context, and conversation history
4. Tool selection: zero or more tools are chosen from the available toolset
5. Tool execution: selected tools run with full context and safety checks
6. Result aggregation: tool outputs are synthesized into a coherent response
7. Response is rendered in the terminal via Ink
8. Context is updated for the next iteration

### 2.3 Functional Requirements

1. The system SHALL accept user input via the CLI and route it to the QueryEngine.
2. The system SHALL use Google ADK for intent classification, tool selection, and response generation.
3. The system SHALL support zero-tool responses (pure conversation) as well as single and multi-tool execution.
4. The system SHALL maintain conversation history across turns with configurable context window management.
5. The system SHALL support streaming responses for real-time feedback to the user.
6. The system SHALL expose a structured log of all decisions: tool selections, reasoning traces, and execution outcomes.
7. The system SHALL allow developers to interrupt, pause, or cancel ongoing operations at any point.
8. The system SHALL support structured output (JSON) as an alternative to natural language when requested.

### 2.4 Acceptance Criteria

- [ ] User input of any complexity (single task to multi-file refactor) is correctly routed and processed
- [ ] Google ADK model receives full project context (git diff, file tree, LSP symbols, shell env)
- [ ] Tool selection is deterministic for identical inputs (given same context)
- [ ] Streaming responses display incrementally in the terminal without flickering
- [ ] Developer can interrupt tool execution mid-operation and receive partial results
- [ ] Conversation history survives process restart via session persistence
- [ ] Structured JSON output is parseable and matches requested schema

### 2.5 Test Scenarios

**TC-01: Simple conversational turn**
Given a running Claude Code session with an authenticated user
When the user types "explain what this function does"
Then the system returns a natural language explanation without executing any tools

**TC-02: Single tool execution**
Given a running session with the user's project in `/tmp/project`
When the user types "show me the contents of README.md"
Then the FileReadTool is selected, README.md is read, and contents are displayed

**TC-03: Multi-tool chained execution**
Given a running session
When the user types "create a backup branch, then refactor UserService to use the new API"
Then the system executes BashTool (git checkout -b backup) followed by FileEditTool (refactor UserService) in sequence

**TC-04: Tool selection determinism**
Given identical project state and identical user input
When the same request is issued twice in separate sessions
Then the tool selection and execution order are identical

**TC-05: Streaming response rendering**
Given a long-form explanation response from the model
When the response is streamed
Then text appears incrementally in the terminal with correct formatting and no visual corruption

**TC-06: Mid-operation interrupt**
Given an ongoing multi-step refactor operation
When the user sends an interrupt signal (Ctrl+C)
Then the current tool completes its current step, results are returned, and no further tools execute

**TC-07: Session persistence across restart**
Given an active session with conversation history
When the Claude Code process is restarted
Then the conversation history is restored and the session continues seamlessly

**TC-08: Structured JSON output**
Given a session
When the user types "list all files as JSON" with an appropriate schema
Then output is valid JSON matching the requested structure

### 2.6 BNF Grammar — Agent Protocol

```
MESSAGE     ::= role: ROLE, content: LIST<CONTENT_PART>, metadata?: METADATA
ROLE        ::= "user" | "assistant" | "tool"
CONTENT_PART ::= text: STRING | tool_use: TOOL_USE | tool_result: TOOL_RESULT
TOOL_USE    ::= tool: STRING, input: OBJECT
TOOL_RESULT ::= tool_use_id: STRING, content: STRING, is_error?: BOOLEAN
METADATA    ::= timestamp: ISO8601, session_id: UUID, model: STRING

REQUEST     ::= session_id: UUID, messages: LIST<MESSAGE>, context: CONTEXT, options?: OPTIONS
CONTEXT     ::= project_path: PATH, git_state: GIT_STATE, file_tree: FILE_TREE, lsp_symbols?: LIST<SYMBOL>
OPTIONS     ::= temperature?: FLOAT, max_tokens?: INTEGER, tools?: LIST<STRING>, stream?: BOOLEAN
RESPONSE    ::= message: MESSAGE, usage?: USAGE, reasoning_trace?: LIST<STRING>
USAGE       ::= input_tokens: INTEGER, output_tokens: INTEGER, total_tokens: INTEGER
```

### 2.7 Out of Scope

- Model training or fine-tuning (uses pre-trained Google ADK models)
- Multi-modal input (images, audio) beyond text
- Persistence of sessions across machines (session affinity to local disk)

---

## 3. Tool Execution System

### 3.1 Description

The tool execution system is the infrastructure layer that provides Claude Code's 40+ capabilities — from bash command execution to file manipulation, LSP integration, web access, task management, and multi-agent coordination. Each tool is a self-contained module with a defined interface, input validation, output schema, and error handling. The tool router selects and sequences tools based on the agent's decisions, and the execution engine runs them with full context and safety checks.

### 3.2 User Journey

1. Agent decides to invoke one or more tools based on user intent
2. For each tool call, the system validates input against the tool's schema (Zod)
3. The tool executes within its domain (filesystem, shell, network, etc.)
4. Results are captured, typed, and returned to the agent
5. Errors are caught, classified (operational vs programmer), and returned as structured results
6. The agent synthesizes tool results into a final response

### 3.3 Functional Requirements

1. Each tool SHALL have a Zod input schema for validation before execution.
2. Each tool SHALL return a typed result with consistent envelope: `{ data, error, metadata }`.
3. Tools SHALL execute with the full project context available (cwd, git state, env vars).
4. The system SHALL support parallel tool execution when tools are independent.
5. The system SHALL support sequential tool execution with result passthrough when tools are dependent.
6. Tool execution SHALL be timeout-configurable per tool and globally.
7. The system SHALL log all tool executions with: tool name, input summary, duration, outcome.
8. The system SHALL allow new tools to be added via the plugin system without modifying core code.
9. The system SHALL support tool mocking for testing purposes.
10. Built-in tools SHALL include: BashTool, FileReadTool, FileEditTool, FileWriteTool, GlobTool, GrepTool, LSPTool, WebSearchTool, WebFetchTool, TaskCreateTool, TaskListTool, TaskUpdateTool, AgentTool, TeamCreateTool, TeamDeleteTool, SendMessageTool, MCPTool, GlobTool, GrepTool, SkillTool, ScheduleCronTool.

### 3.4 Tool Categories and Schemas

| Category | Tools | Execution Model |
|----------|-------|-----------------|
| **File Operations** | FileReadTool, FileWriteTool, FileEditTool, GlobTool, GrepTool | Sequential with context |
| **Shell** | BashTool | Sequential, permission-gated |
| **Language Services** | LSPTool (goto, findRefs, hover, etc.) | Concurrent-safe |
| **Web** | WebSearchTool, WebFetchTool | Parallel |
| **Task Management** | TaskCreateTool, TaskListTool, TaskUpdateTool | Sequential |
| **Multi-Agent** | AgentTool, TeamCreateTool, TeamDeleteTool, SendMessageTool | Coordinator-driven |
| **MCP** | MCPTool (client + server) | Bidirectional streaming |
| **Skills** | SkillTool | Isolated subprocess |
| **Scheduling** | ScheduleCronTool, CronCreate, CronDelete, CronList | Event-driven |
| **System** | Read, Write, Edit, Glob, Grep (dedicated MCP tools) | Direct |

### 3.5 Acceptance Criteria

- [ ] Each built-in tool can be invoked and returns correctly typed results
- [ ] Invalid tool input is rejected with a descriptive error before execution
- [ ] Parallel tool execution produces results matching sequential execution order
- [ ] Tool timeouts trigger cancellation and return timeout error
- [ ] New plugins can register tools that appear in the tool list without restart
- [ ] All tool executions appear in the structured log

### 3.6 Test Scenarios

**TC-01: FileReadTool execution**
Given a project with `/tmp/project/README.md` containing "Hello World"
When FileReadTool is invoked with `{ path: "/tmp/project/README.md" }`
Then the result data is "Hello World" and error is null

**TC-02: BashTool with permission**
Given BashTool with permission mode set to `limited`
When the user requests `ls -la /tmp`
Then the command executes and returns directory listing

**TC-03: BashTool without permission**
Given BashTool with permission mode set to `deny`
When the user requests `rm -rf /tmp/project`
Then the command is blocked, error returned, and event is logged

**TC-04: Parallel tool execution**
Given two independent file reads
When FileReadTool is invoked twice in parallel
Then both files are read and results returned in under 2x the time of sequential execution

**TC-05: Tool schema validation failure**
Given FileEditTool with schema requiring `path` and `old_string` fields
When invoked with `{ path: "/tmp/file.txt" }` (missing old_string)
Then the tool returns a validation error before any file operations occur

**TC-06: Plugin-registered tool**
Given a loaded plugin that registers a custom "FetchJiraTicketTool"
When the agent selects this tool
Then it executes via the plugin's handler and returns results in the standard envelope

**TC-07: Tool timeout**
Given BashTool with a 5-second timeout configured
When a command runs for longer than 5 seconds
Then the process is killed and a timeout error is returned

### 3.7 Out of Scope

- Tool execution on remote machines (handled by remote bridge)
- Tool execution history persistence beyond the current session
- Built-in tools for specific cloud providers (AWS, GCP, Azure)

---

## 4. Context and Memory Management

### 4.1 Description

Context and memory management ensures Claude Code maintains full awareness of the project throughout the conversation. This includes git state (branch, diff, history), file structure, LSP symbols, shell environment variables, and conversation history. Memory is layered: working memory (current session), episodic memory (past sessions via autoDream), and semantic memory (project facts extracted via memory agents).

### 4.2 User Journey

1. Developer starts a Claude Code session in a project directory
2. The context manager scans and indexes: git state, file tree, LSP symbols, shell env
3. Initial context is injected into the agent's prompt for every turn
4. As tools execute, context is updated incrementally (e.g., new files, git changes)
5. After session end (or periodically), memory agents extract key facts and store them
6. On session resume, memories are re-injected as relevant context

### 4.3 Functional Requirements

1. The system SHALL capture git state on session start: branch name, staged/unstaged changes, recent commits.
2. The system SHALL maintain a file tree index of the project, updated on file change events.
3. The system SHALL integrate with LSP servers to provide symbol-level context (types, functions, imports).
4. The system SHALL track shell environment variables relevant to the project (from .env, config files).
5. The system SHALL support configurable context window limits, snipping oldest messages when exceeded.
6. The system SHALL support session memory: user preferences, project-specific settings, recent operations.
7. The system SHALL support autoDream: background memory consolidation running as a forked agent after N hours or M sessions.
8. The system SHALL extract and store semantic memories (project facts, architecture decisions) via extractMemories agent.
9. Memory SHALL be stored in the `memdir/` directory using `MEMORY.md` and per-session JSON files.
10. The system SHALL NOT store sensitive data (API keys, tokens, passwords) in memories.

### 4.4 Context Injection Protocol

```
FUNCTION build_context(session):
    git_state   = run("git status --short && git log --oneline -10")
    file_tree   = get_file_tree(session.project_path, max_depth=3)
    lsp_symbols = lsp.get_symbols(session.project_path) IF lsp_available
    env_vars    = parse_env_files(session.project_path)  # .env, .env.local
    memories    = memory_store.get_relevant(session.project_path, session.history)
    session_mem = session_store.get(session.id)

    RETURN {
        git_state,
        file_tree,
        lsp_symbols,
        env_vars,
        memories,
        session_mem
    }
```

### 4.5 Memory Storage Structure

```
memdir/
├── MEMORY.md           # Consolidated semantic memories (human + machine readable)
├── sessions/
│   ├── {session-id}.json   # Session memory (preferences, state)
│   └── ...
├── dreams/
│   └── {dream-id}.json    # autoDream consolidation outputs
└── extracted/
    └── {fact-id}.json    # Individual extracted facts
```

### 4.6 Acceptance Criteria

- [ ] Session start captures git branch, diff, and last 10 commits within 2 seconds for projects under 1000 files
- [ ] File tree index is updated within 500ms of file creation/deletion
- [ ] Context injection provides LSP symbols when LSP server is running for the project
- [ ] Context window management correctly snips oldest messages and preserves recent context
- [ ] autoDream fires after configured interval and produces consolidated memory files
- [ ] Sensitive env vars are detected and redacted from all memory storage
- [ ] Session resume correctly restores memories and project context

### 4.7 Test Scenarios

**TC-01: Git state capture**
Given a project with staged and unstaged changes
When a Claude Code session starts
Then git state is captured and available in context

**TC-02: File tree indexing**
Given a project with 500 files
When the context manager indexes the file tree
Then all files are indexed within 2 seconds and updates propagate within 500ms of changes

**TC-03: LSP symbol availability**
Given a TypeScript project with a running LSP server
When context is built
Then function names, types, and import relationships are available to the agent

**TC-04: Context window snipping**
Given a conversation that exceeds the configured context window (e.g., 100 messages)
When the next message is processed
Then the 50 oldest messages are archived and recent context is preserved

**TC-05: autoDream memory consolidation**
Given a session older than 24 hours (default)
When autoDream triggers
Then a background agent extracts key facts and stores them in memdir/

**TC-06: Sensitive data redaction**
Given a .env file with `API_KEY=sk-secret123`
When session memory is stored
Then the stored memory contains "REDACTED" instead of the actual key value

**TC-07: Session resume**
Given a previous session with accumulated memories
When a new session starts in the same project
Then memories are injected into context and the agent references past decisions

### 4.8 Out of Scope

- Long-term memory across completely unrelated projects (memories are project-scoped)
- Automatic context pruning based on relevance scoring (manual config only)
- Memory encryption at rest (filesystem-level encryption assumed)

---

## 5. Multi-Agent Orchestration

### 5.1 Description

Multi-agent orchestration enables multiple specialized agents to collaborate on complex tasks. The coordinator agent manages a pool of subagents, assigning each a specific role or task domain. Agents communicate via structured messages (SendMessageTool), share context through team memory, and coordinate through a shared state graph. This enables parallel problem-solving where different agents handle different aspects of a large task simultaneously.

### 5.2 User Journey

1. Developer submits a complex task (e.g., "migrate our auth system to OAuth")
2. Coordinator agent decomposes the task into subtasks (backend, frontend, tests, docs)
3. Subagents are spawned with specialized context and role definitions
4. Subagents execute in parallel, communicating via message passing
5. Coordinator aggregates results, handles conflicts, and synthesizes final output
6. Developer receives a cohesive result as if from a single agent

### 5.3 Functional Requirements

1. The system SHALL support spawning subagents via AgentTool with configurable roles and context.
2. The system SHALL support a coordinator mode where a parent agent orchestrates child agents.
3. Subagents SHALL communicate via SendMessageTool with structured message envelopes.
4. The system SHALL maintain a shared team memory accessible to all agents in a team.
5. Subagents SHALL inherit a subset of the parent context based on their role.
6. The system SHALL support inter-agent messaging with delivery confirmation.
7. The system SHALL handle agent crashes gracefully, propagating errors to the coordinator.
8. The system SHALL support a team hierarchy: creator → coordinator → subagents.
9. Maximum agent pool size SHALL be configurable to prevent resource exhaustion.
10. Subagent execution SHALL be cancellable by the coordinator or user.

### 5.4 Agent Types

| Agent Type | Description | Spawn Pattern |
|------------|-------------|----------------|
| **Coordinator** | Orchestrates subagents, aggregates results | User-spawned or nested |
| **Researcher** | Explores codebase, finds relevant files | Coordinator-spawned |
| **Coder** | Implements changes in a specific module | Coordinator-spawned |
| **Reviewer** | Reviews changes, identifies issues | Coordinator-spawned |
| **Custom** | Loaded from JSON definition files | Via AgentTool |

### 5.5 Team Communication Protocol

```
MESSAGE Envelope:
{
    from: agent_id,
    to: agent_id | "broadcast",
    type: "request" | "response" | "event" | "error",
    payload: any,
    reply_to?: message_id,
    timestamp: ISO8601
}
```

### 5.6 Acceptance Criteria

- [ ] A coordinator can spawn 3+ subagents with distinct roles
- [ ] Subagents can exchange messages and share findings with the coordinator
- [ ] Team memory is readable and writable by all team members
- [ ] Coordinator aggregates subagent results into a single coherent response
- [ ] Agent crash is detected and reported to coordinator with error details
- [ ] Maximum agent pool limit is enforced and returns a clear error when exceeded
- [ ] User can cancel a running multi-agent task at any point

### 5.7 Test Scenarios

**TC-01: Coordinator spawning subagents**
Given a running Claude Code session with coordinator mode
When the user requests a complex task
Then the coordinator spawns appropriate subagents and assigns roles

**TC-02: Inter-agent message passing**
Given a team with a researcher and a coder agent
When the researcher finds relevant files and sends a message to the coder
Then the coder receives the message and uses the file paths in its work

**TC-03: Team memory access**
Given a team working on a migration task
When any subagent writes an architectural decision to team memory
Then all other subagents can read that decision in subsequent turns

**TC-04: Result aggregation**
Given 3 subagents completing their respective subtasks
When all complete and send results to the coordinator
Then the coordinator synthesizes a single coherent response for the user

**TC-05: Subagent crash handling**
Given a subagent that encounters an unhandled exception
When the crash occurs
Then the coordinator receives an error notification and reports it to the user

**TC-06: Agent pool limit enforcement**
Given maximum pool size of 5
When a task requests spawning the 6th agent
Then an error is returned and no additional agent is spawned

**TC-07: User-initiated cancellation**
Given a running multi-agent migration task
When the user types "cancel"
Then all subagents are terminated and partial results are returned

### 5.8 Out of Scope

- Cross-team coordination (multiple independent teams)
- Agent-to-agent trust and authentication (same session = trusted)
- Persistent agent identity across sessions

---

## 6. Safety and Permission Boundaries

### 6.1 Description

The safety and permission system ensures Claude Code operates within boundaries defined by the developer. It encompasses permission modes (allowlist/denylist for bash commands), secret detection and redaction, project state protection (git, uncommitted changes), and security policies that prevent destructive operations from executing without explicit developer consent.

### 6.2 User Journey

1. Developer configures permission mode (ask, allow, deny, limited)
2. Each bash command undergoes security validation before execution
3. Sensitive operations (file deletion, force push) require explicit confirmation
4. Secrets are detected and redacted from logs, memory, and error messages
5. Unsafe operations are blocked with clear explanation and suggested safe alternatives

### 6.3 Functional Requirements

1. The system SHALL support permission modes: `ask` (confirm each command), `allow` (run all), `deny` (block all bash), `limited` (allowlist-based).
2. The system SHALL validate bash commands against a security policy before execution.
3. The system SHALL detect and block destructive patterns: `rm -rf` without confirmation, `git push --force`, `DROP DATABASE`, etc.
4. The system SHALL detect and redact secrets (API keys, tokens, passwords) from all output.
5. The system SHALL never commit sensitive data to memory or logs.
6. The system SHALL require explicit user confirmation for operations that modify git history or delete files.
7. The system SHALL provide an audit log of all security-relevant events.
8. The system SHALL support git stash before destructive operations to preserve work.
9. Permission configuration SHALL be persisted across sessions.
10. The system SHALL support a "denylist" of specific commands regardless of permission mode.

### 6.4 Permission Mode Configuration

| Mode | Bash Execution | Confirmation | Use Case |
|------|---------------|--------------|----------|
| `ask` | Requires approval per command | Yes, interactive | Default for new users |
| `allow` | All commands permitted | No | Trusted environment |
| `deny` | All bash blocked | N/A | Read-only analysis mode |
| `limited` | Allowlist-based | For off-list commands | Production safety |

### 6.5 Security Policy Rules

```
PATTERNS_BLOCKED = [
    "rm -rf /",
    "rm -rf ~",
    "git push --force",
    "DROP DATABASE",
    "FORMAT C:",
    "rm -rf node_modules (without confirmation)"
]

PATTERNS_REQUIRING_CONFIRMATION = [
    "rm -rf",
    "git push --force",
    "git reset --hard",
    "chmod -R 777",
    "curl | sh",
    "wget | sh"
]

SECRET_PATTERNS = [
    "sk-[a-zA-Z0-9]{20,}",           # OpenAI API keys
    "ghp_[a-zA-Z0-9]{36}",           # GitHub tokens
    "password\s*=\s*['\"][^'\"]{8,}['\"]",  # Password assignments
    "api[_-]?key\s*=\s*['\"][^'\"]{8,}['\"]"  # Generic API keys
]
```

### 6.6 Acceptance Criteria

- [ ] `rm -rf /tmp/test` is blocked in `limited` mode without explicit allowlisting
- [ ] `rm -rf /tmp/test` requires confirmation in `ask` mode
- [ ] API key `sk-1234567890abcdef...` is redacted in all output and logs
- [ ] `git push --force` requires explicit confirmation before execution
- [ ] Security audit log captures all blocked commands with timestamp and reason
- [ ] Permission mode persists across session restart
- [ ] Developer can allowlist specific commands in `limited` mode
- [ ] Uncommitted git changes are stashed before destructive file operations

### 6.7 Test Scenarios

**TC-01: Blocked destructive command**
Given permission mode `limited` with no allowlist
When the user requests `rm -rf /tmp/project`
Then the command is blocked and an error is returned

**TC-02: Confirmation prompt for dangerous command**
Given permission mode `ask`
When the user requests `rm -rf node_modules`
Then a confirmation prompt is displayed and the command executes only on explicit approval

**TC-03: Secret redaction in response**
Given a command that outputs an API key
When the response is rendered
Then the API key appears as "sk-••••••••" in the terminal

**TC-04: Secret redaction in logs and memory**
Given a session where an API key was used or referenced
When memories are stored or logs are written
Then the API key does not appear in plaintext

**TC-05: Force push confirmation**
Given permission mode `ask`
When the user requests `git push --force`
Then a confirmation prompt warns about history destruction and the command executes only on approval

**TC-06: Audit log completeness**
Given a mix of allowed, blocked, and confirmed commands
When the audit log is reviewed
Then each command appears with: timestamp, command, mode, decision, and reason

**TC-07: Permission persistence**
Given permission mode set to `limited`
When the session is restarted
Then the permission mode is still `limited` without requiring reconfiguration

### 6.8 Out of Scope

- Network-level security (TLS, certificate validation)
- Host-based intrusion detection
- Automated security scanning of project dependencies

---

## 7. Terminal UI Rendering

### 7.1 Description

The terminal UI layer renders Claude Code's interface using React and Ink — React for CLI — enabling rich, interactive terminal experiences. It handles ANSI color parsing, text wrapping, component layout (dialogs, spinners, progress indicators, code blocks), keyboard input, and screen management. The UI is output-only (no HTML DOM), making it compatible with any terminal emulator.

### 7.2 User Journey

1. Claude Code initializes the Ink tree with root components
2. Agent responses and tool results are rendered as React components
3. The component tree is reconciled and output as ANSI-escaped text
4. User interactions (keyboard, mouse events) are captured and routed to handlers
5. Dialogs and overlays are rendered above the main content
6. Screen state is managed for multi-page outputs (scrollable logs, paginated results)

### 7.3 Functional Requirements

1. The system SHALL render ANSI-colored text with proper escape sequence handling.
2. The system SHALL support text wrapping at the terminal width with configurable margins.
3. The system SHALL render interactive components: spinners, progress bars, dialogs, tables, code blocks with syntax highlighting.
4. The system SHALL support keyboard shortcuts that are configurable via keybindings.
5. The system SHALL support vim mode for text input (via vim/ module).
6. The system SHALL support mouse events where the terminal emulator supports them.
7. The system SHALL support paginated output for long results (e.g., log files).
8. The system SHALL support screen clearing and redraw for dynamic updates.
9. The system SHALL render code blocks with language-aware syntax highlighting.
10. The system SHALL support a "more" prompt for interactive continuation of long output.

### 7.10 Out of Scope

- Rendering in non-ANSI terminals (legacy, non-color terminals)
- Rich text beyond ANSI (images, hyperlinks in terminal — use OSC 8 if available)
- Multiple simultaneous terminal sessions (handled by tmux integration)

### 7.11 Component Inventory

| Component | Purpose | States |
|-----------|---------|--------|
| `Message` | Render user/assistant messages | default, streaming, error |
| `Spinner` | Indicate ongoing operation | active, completed, failed |
| `Dialog` | Confirmation prompts, inputs | open, confirmed, cancelled |
| `CodeBlock` | Syntax-highlighted code display | default, with line numbers, diff |
| `Table` | Tabular data display | default, sortable, paginated |
| `ProgressBar` | Long-running operation progress | indeterminate, percentage |
| `ErrorBanner` | Error message display | error, warning, info |
| `BuddyDisplay` | ASCII companion sprite | idle, happy, sad, working |

### 7.12 Acceptance Criteria

- [ ] Colored output renders correctly in common terminals (iTerm2, Kitty, Windows Terminal)
- [ ] Long lines are wrapped at terminal width without breaking words
- [ ] Spinner animation updates at 60fps without flickering
- [ ] Keyboard shortcuts are triggered correctly regardless of input mode
- [ ] Code blocks render with correct syntax highlighting for TypeScript, Python, Go, Rust, SQL
- [ ] Vim mode correctly handles all standard motions and operations
- [ ] "More" prompt appears for output exceeding terminal height and responds to Space/Enter/q
- [ ] Screen updates are atomic (no partial renders visible to user)

### 7.13 Test Scenarios

**TC-01: ANSI color rendering**
Given a response containing ANSI color codes
When it is rendered in iTerm2
Then red text appears red, green text appears green, and reset codes restore default color

**TC-02: Line wrapping**
Given a 300-character line in a 80-column terminal
When the line is rendered
Then it wraps at column 80, breaking only at word boundaries where possible

**TC-03: Spinner animation**
Given an ongoing operation (e.g., running tests)
When the spinner is displayed
Then it animates smoothly at 60fps without consuming excessive CPU

**TC-04: Keyboard shortcut triggering**
Given the keybinding for "Ctrl+U to clear line"
When the user presses Ctrl+U
Then the current input line is cleared

**TC-05: Code block syntax highlighting**
Given a TypeScript code block in the response
When it is rendered
Then keywords are one color, strings another, comments yet another, and line numbers are displayed

**TC-06: Vim mode text editing**
Given vim mode enabled and the user pressing "dd"
When in command mode
Then the current line is deleted

**TC-07: Paginated "more" prompt**
Given a command output of 500 lines in a 24-row terminal
When the output is rendered
Then a "--- More ---" prompt appears and Space/Enter/q navigate correctly

### 7.14 Out of Scope

- Rendering in non-ANSI terminals (legacy, non-color terminals)
- Rich text beyond ANSI (images, hyperlinks in terminal — use OSC 8 if available)
- Multiple simultaneous terminal sessions (handled by tmux integration)

---

## 8. IDE Bridge Integration

### 8.1 Description

The IDE bridge integrates Claude Code with the developer's IDE — primarily VS Code — enabling seamless handoffs between terminal and editor. The bridge supports remote sessions (connecting to a Claude Code instance running elsewhere), trusted device flows for authentication, and bidirectional communication between Claude Code and the editor's LSP and debugger.

### 8.2 User Journey

1. Developer opens a project in VS Code with the Claude Code extension installed
2. The extension connects to the local or remote Claude Code instance via a bridge protocol
3. Developer can invoke Claude Code from a sidebar panel or command palette
4. Claude Code's terminal output is mirrored in the VS Code panel
5. File edits made by Claude Code are reflected immediately in the editor
6. Remote sessions (teleport) allow connecting to Claude Code running on a server or container

### 8.3 Functional Requirements

1. The VS Code extension SHALL connect to Claude Code via a WebSocket bridge protocol.
2. The system SHALL support remote session bridging: client connects to Claude Code on a remote machine.
3. The system SHALL support trusted device flow: a device code OAuth flow for secure authentication.
4. The system SHALL mirror Claude Code terminal output to the VS Code output panel.
5. File system events SHALL be synchronized between Claude Code and VS Code (file watchers).
6. The system SHALL support launching Claude Code from within VS Code and returning focus after completion.
7. The system SHALL support LSP integration so Claude Code can use the editor's symbol index.
8. The bridge SHALL support JWT-based authentication with short-lived tokens and refresh token rotation.
9. The system SHALL support session handoff: pause a session in terminal, resume in VS Code.

### 8.4 Bridge Protocol

```
WS BRIDGE PROTOCOL:
{
    type: "file_event" | "terminal_output" | "agent_command" | "session_handoff",
    payload: OBJECT,
    session_id: UUID,
    timestamp: ISO8601
}

FILE_EVENT:
{
    type: "changed" | "created" | "deleted",
    path: PATH,
    content?: STRING  // for changed/created
}

TERMINAL_OUTPUT:
{
    lines: LIST<STRING>,
    style?: LIST<STYLE>
}

SESSION_HANDOFF:
{
    from: "terminal" | "vscode",
    to: "terminal" | "vscode",
    session_state: SERIALIZED_STATE
}
```

### 8.5 Acceptance Criteria

- [ ] VS Code extension connects to Claude Code via WebSocket and authenticates with JWT
- [ ] Terminal output appears in VS Code output panel within 100ms of generation
- [ ] File edits in Claude Code are immediately visible in VS Code editor
- [ ] Remote session connects and maintains stable connection for at least 30 minutes
- [ ] Trusted device flow completes without exposing tokens to the terminal
- [ ] Session handoff preserves full conversation state when switching between terminal and VS Code
- [ ] LSP symbols from VS Code are available to Claude Code's context builder

### 8.6 Test Scenarios

**TC-01: VS Code extension connection**
Given Claude Code running locally and VS Code with the extension
When the extension connects
Then a WebSocket connection is established and a JWT is exchanged

**TC-02: Terminal output mirroring**
Given an active Claude Code session running in the terminal
When output is generated
Then it appears in the VS Code output panel within 100ms

**TC-03: File edit synchronization**
Given Claude Code editing a file
When the edit is saved
Then the change is immediately visible in VS Code without manual refresh

**TC-04: Remote session connection**
Given a Claude Code instance on a remote server
When the local VS Code extension connects via `claude teleconnect`
Then a stable WebSocket connection is established and all features work as if local

**TC-05: Trusted device OAuth flow**
Given a new machine without existing credentials
When the user initiates trusted device flow
Then a browser opens, user approves, and tokens are stored securely without terminal exposure

**TC-06: Session handoff terminal to VS Code**
Given a Claude Code session in the terminal with conversation history
When the user opens VS Code and triggers "Resume Session"
Then all context, history, and memories are available in the VS Code session

**TC-07: LSP symbol availability**
Given a TypeScript project open in VS Code
When Claude Code analyzes the codebase
Then VS Code LSP symbols (function names, types, imports) are available in context

### 8.7 Out of Scope

- JetBrains IDE integration (not in initial scope)
- Vim/Neovim LSP integration (handled via standard LSP, not IDE bridge)
- Mobile IDEs (vscode.dev, GitHub Codespaces)

---

## 9. Reliability and Crash Recovery

### 9.1 Description

Reliability and crash recovery ensure Claude Code gracefully handles failures — whether from network issues, tool timeouts, corrupted state, or unexpected errors. The system provides comprehensive observability (structured logging, metrics, tracing), automatic recovery patterns (retry with backoff, circuit breakers), and session persistence that allows developers to resume exactly where they left off.

### 9.2 User Journey

1. Developer starts a session — state is persisted immediately to disk
2. An operation fails (network timeout, tool error) — system retries with backoff
3. Session crashes — on restart, developer sees "Session interrupted, resuming..."
4. Partial work is recovered — uncommitted git changes, in-progress file edits are preserved
5. Metrics are exposed — `/health` and `/metrics` endpoints for operational monitoring
6. Errors are logged — structured logs with trace IDs for distributed tracing

### 9.3 Functional Requirements

1. The system SHALL persist session state to disk after every meaningful operation (tool completion, user message).
2. The system SHALL expose a `/health` endpoint returning service status, dependency health, and uptime.
3. The system SHALL expose a `/metrics` endpoint in Prometheus format with request rate, error rate, and latency (p50, p95, p99).
4. The system SHALL support structured JSON logging with: timestamp, level, service, traceId, message, context.
5. The system SHALL implement retry with exponential backoff for transient failures (network, rate limits).
6. The system SHALL implement circuit breaker patterns for external dependencies (MCP servers, API calls).
7. The system SHALL generate a trace ID on session start and propagate it through all operations.
8. The system SHALL support automatic session recovery on restart: exact state resume without data loss.
9. The system SHALL preserve uncommitted git changes and in-progress file edits across crashes.
10. The system SHALL distinguish between operational errors (expected) and programmer errors (bugs) and handle each appropriately.

### 9.4 Error Classification

```
ERROR_TYPES = {
    "operational": [           # Expected, handled gracefully
        "network_timeout",
        "rate_limit_exceeded",
        "tool_timeout",
        "user_interrupted",
        "invalid_input",
        "resource_not_found"
    ],
    "programmer": [            # Unexpected, treated as bugs
        "null_dereference",
        "assertion_failed",
        "invariant_violated",
        "unhandled_promise_rejection"
    ]
}

OPERATIONAL_ERROR_RESPONSE = {
    code: STRING,
    message: GENERIC_USER_MESSAGE,  # Never exposes internals
    details?: OBJECT,
    retryable: BOOLEAN
}

PROGRAMMER_ERROR_RESPONSE = {
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred",  # Generic
    incident_id: UUID  # For support
}
```

### 9.5 Retry and Circuit Breaker Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| `max_retries` | 3 | Maximum retry attempts |
| `initial_backoff` | 1s | Initial delay between retries |
| `max_backoff` | 30s | Maximum delay cap |
| `backoff_multiplier` | 2 | Exponential factor |
| `circuit_breaker_threshold` | 5 | Failures before opening |
| `circuit_breaker_timeout` | 60s | Time before half-open |

### 9.6 Health Endpoint Response

```json
{
  "status": "healthy" | "degraded" | "unhealthy",
  "uptime_seconds": 3600,
  "dependencies": {
    "anthropic_api": "up",
    "lsp_server": "up",
    "git": "up",
    "filesystem": "up"
  },
  "version": "1.2.3",
  "session_count": 5,
  "memory_mb": 128
}
```

### 9.7 Acceptance Criteria

- [ ] Session state is recoverable after process kill and restart
- [ ] `/health` endpoint returns within 100ms and accurately reflects dependency status
- [ ] `/metrics` endpoint returns valid Prometheus-formatted metrics
- [ ] Structured logs include trace ID that can be used to correlate all operations in a request
- [ ] Transient network failures are retried with exponential backoff without flooding the API
- [ ] Circuit breaker opens after 5 consecutive failures and returns cached responses when possible
- [ ] Uncommitted git changes are preserved across crash recovery
- [ ] Programmer errors are caught by global handler and never exposed to user

### 9.8 Test Scenarios

**TC-01: Session state persistence**
Given an active session with conversation history and context
When the process is killed (SIGKILL)
And the process is restarted
Then all conversation history, context, and memories are restored

**TC-02: Health endpoint accuracy**
Given running Claude Code
When `/health` is called
Then dependencies are checked and accurate status is returned within 100ms

**TC-03: Metrics endpoint format**
Given running Claude Code
When `/metrics` is called
Then output is valid Prometheus format with request_rate, error_rate, latency buckets

**TC-04: Trace ID propagation**
Given a user request
When the request is processed
Then all log entries for that request share the same trace ID

**TC-05: Network retry with backoff**
Given a transient network failure on an API call
When the error occurs
Then retries happen at 1s, 2s, 4s intervals up to 3 attempts before returning error

**TC-06: Circuit breaker activation**
Given 5 consecutive failed requests to an MCP server
When the 6th request is made
Then a circuit breaker error is returned immediately without attempting the call

**TC-07: Git change preservation**
Given uncommitted changes in the git working tree
When Claude Code crashes
Then git status is restored on restart with changes intact

**TC-08: Global error handler**
Given an unhandled exception in tool execution
When the error occurs
Then a generic error message is shown to user and the error is logged with full details

### 9.9 Out of Scope

- Multi-region failover (single instance only)
- Automatic scaling (horizontal pod scaling via K8s)
- External metrics aggregation (Datadog, New Relic — only Prometheus endpoint)

---

## 10. Definition of Done

All acceptance criteria across all sections have corresponding passing tests.

Every `SHALL` and `SHALL NOT` requirement is verified by at least one `Given/When/Then` test scenario that executes successfully in a CI environment.

**Quality Gates:**
- [ ] All acceptance criteria have at least one passing test
- [ ] No `// TODO` or `// FIXME` comments in shipped code
- [ ] No hardcoded secrets, credentials, or API keys in source
- [ ] All external inputs validated via Zod schemas before use
- [ ] Structured logs emitted for all significant operations
- [ ] `/health` and `/metrics` endpoints return valid responses
- [ ] Permission mode persists correctly across sessions
- [ ] Session recovery restores exact state after crash
- [ ] Safety system blocks all patterns in blocklist
- [ ] Terminal UI renders without flickering at 60fps
- [ ] Multi-agent coordination handles subagent crashes gracefully
- [ ] Secret redaction verified in logs, memory, and UI output

**All acceptance criteria have corresponding passing tests.**

---

## Appendix A: Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Bun (primary), Node.js v18+ |
| Language | TypeScript (strict mode) |
| CLI Framework | Commander.js |
| UI Framework | React + Ink |
| AI Engine | Google ADK (Agent Development Kit) |
| Protocol | Model Context Protocol (MCP SDK) |
| State Management | Zustand-like store pattern |
| Styling | Chalk (terminal colors), ANSI escapes |
| Validation | Zod v4 |
| Feature Flags | GrowthBook |
| Logging | Structured JSON (Pino-compatible) |
| Metrics | Prometheus format |
| Authentication | JWT with refresh token rotation |
| Database | SQLite (migrations via node-persist) |

## Appendix B: Directory Structure

```
src/
├── main.tsx                    # CLI entrypoint
├── QueryEngine.ts              # Core query logic
├── Tool.ts                     # Base tool definitions
├── tools/                      # 40+ tool implementations
├── services/                   # Backend services (MCP, OAuth, Analytics)
├── coordinator/                # Multi-agent orchestration
├── bridge/                     # IDE integration
├── components/                 # React components
├── ink/                        # React/Ink renderer
├── commands/                   # CLI slash commands
├── utils/                      # Utilities
├── state/                      # State management
├── hooks/                      # React hooks
├── context/                    # Context providers
├── tasks/                      # Task management
├── skills/                     # Built-in skills
├── plugins/                    # Plugin system
├── migrations/                 # Database migrations
├── memdir/                     # Memory directory
├── types/                      # TypeScript types
├── constants/                  # Constants
├── screens/                    # Full-screen UI
├── keybindings/                # Keyboard handling
├── vim/                        # Vim mode
├── voice/                      # Voice input
├── schemas/                    # Zod schemas
└── server/                     # Server components
```

## Appendix C: Security Considerations

1. **No secrets in source** — All secrets via environment variables or secrets manager
2. **Input validation** — Zod schemas for all external input at every boundary
3. **Output encoding** — ANSI-safe rendering, no raw HTML injection
4. **Secret scanning** — Pattern matching for API keys, tokens, passwords in all output
5. **Permission modes** — Developer-controlled execution boundaries
6. **JWT with short expiration** — Tokens expire in 15 minutes, refresh rotation
7. **Rate limiting** — Per-IP and per-user rate limits on API endpoints
8. **Audit logging** — All security-relevant events are logged with trace ID

---

## Derived From

- Ralph Wiggum Technique — Geoffrey Huntley (github.com/ghuntley/how-to-ralph-wiggum)
- Ralph Wiggum Playbook — Clayton Farr (github.com/ClaytonFarr/ralph-playbook)
- NLSpec format — StrongDM Attractor (github.com/strongdm/attractor)
- Google ADK Documentation — Google Agent Development Kit
