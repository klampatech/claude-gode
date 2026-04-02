# Otto Loop Guide

The Otto loop is a portable implementation of the Ralph Wiggum Technique — an AI-assisted development methodology that uses a simple bash loop to repeatedly invoke Claude Code for iterative software development.

---

## Quick Start

```bash
# Make the script executable
chmod +x otto.sh

# Initialize git (if not already)
git init
git add -A
git commit -m "Initial commit"

# Run in build mode (unlimited iterations)
./otto.sh

# Or run a specific number of iterations
./otto.sh 10

# Run in plan mode
./otto.sh plan

# Run plan mode with max iterations
./otto.sh plan 5
```

---

## Project Structure

```
otto-matic/
├── otto.sh              # Main loop script
├── PROMPT_plan.md       # Planning mode prompt
├── PROMPT_build.md      # Build mode prompt
├── AGENTS.md            # Operational guide (how to build/test)
├── IMPLEMENTATION_PLAN.md  # Prioritized task list
├── specs/               # Requirement specs (one per topic)
│   └── *.md             # Specification files
└── src/                 # Application source code
```

---

## How the Loop Works

### Build Mode (Default)
```
./otto.sh
```
1. Reads `PROMPT_build.md`
2. Claude Code analyzes specs, picks a task from `IMPLEMENTATION_PLAN.md`
3. Implements the task using subagents
4. Runs tests (backpressure)
5. Commits and pushes
6. Exits — loop restarts with fresh context

### Plan Mode
```
./otto.sh plan
```
1. Reads `PROMPT_plan.md`
2. Analyzes gaps between specs and codebase
3. Updates `IMPLEMENTATION_PLAN.md` with prioritized tasks
4. Commits and exits

---

## Tuning Otto

### Context Efficiency

- **Token budget**: ~176K usable tokens from 200K+ context window
- **Smart zone**: 40-60% context utilization
- **One task per loop**: Maximizes context efficiency
- **Use subagents**: Each subagent gets ~156KB (memory extension)

### Steering Otto

**Upstream Steering (Setup)**
- Allocate first ~5,000 tokens for specs
- Keep every loop's context allocated with the same files
- If Otto generates wrong patterns, add/update utilities and code patterns

**Downstream Steering (Backpressure)**
- Edit `AGENTS.md` to specify your project's actual test commands
- Tests, typechecks, lints, and builds reject invalid work
- Otto will "run tests" per the prompt — make sure AGENTS.md says what to run

### Loop Parameters

| Parameter | Description | Tuning |
|-----------|-------------|--------|
| `--model opus` | Complex reasoning, task selection | Use for planning, debugging |
| `--model sonnet` | Faster, for clear tasks | Use in build mode when plan is solid |
| `--dangerously-skip-permissions` | Auto-approve all tool calls | Use in sandbox only! |
| `MAX_ITERATIONS` | Limit iterations | Start small (5-10) to observe patterns |

### Escape Hatches

- **Ctrl+C**: Stop the loop
- **git reset --hard**: Revert uncommitted changes
- **Regenerate plan**: Delete `IMPLEMENTATION_PLAN.md` and run `./otto.sh plan`

---

## Best Practices

### When to Regenerate the Plan

Regenerate `IMPLEMENTATION_PLAN.md` when:
- Otto goes off track implementing wrong things
- The plan feels stale or doesn't match current state
- Too much clutter from completed items
- Significant spec changes
- You're confused about what's actually done

### Move Outside the Loop

- Sit and watch early to observe patterns
- Tune reactively — when Otto fails a specific way, add a sign to help next time
- "Signs" can be: prompt guardrails, AGENTS.md learnings, utilities in codebase
- The plan is disposable — regeneration cost is cheap

### Sandbox Requirements

**IMPORTANT**: Otto runs without permissions. Use a sandbox:
- **Local**: Docker container
- **Remote**: Fly Sprims, E2B, or similar

Never run directly on your host machine with access to:
- Browser cookies
- SSH keys
- Access tokens
- Private data

### Keep AGENTS.md Lean

- Only operational notes — how to build/run
- Status updates go in `IMPLEMENTATION_PLAN.md`
- A bloated AGENTS.md pollutes every loop's context

---

## Recommendations from the Source

### Context Is Everything
- Use main agent as scheduler, not for expensive work
- Prefer Markdown over JSON for token efficiency
- Subagents are memory extensions

### Let Otto Ralph
- Trust Otto to self-identify, self-correct, self-improve
- Eventual consistency through iteration
- Minimal intervention from you

### Scope Discipline
- One task per loop iteration
- Commit when tests pass
- Exit after commit — loop restarts fresh

---

## Customizing for Your Project

1. **Edit `specs/`**: Add your requirement specifications
2. **Edit `AGENTS.md`**: Fill in actual build/test commands for your project
3. **Edit `src/`**: Your application code goes here (no subdirectories required)
4. **Run `./otto.sh plan`**: Generate initial implementation plan
5. **Run `./otto.sh`**: Start building!

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Otto goes in circles | Regenerate plan: `rm IMPLEMENTATION_PLAN.md && ./otto.sh plan` |
| Wrong things being built | Update specs/* and regenerate plan |
| Tests never pass | Fix AGENTS.md test commands, or fix the code |
| Context getting too full | Subagents — don't do expensive work in main agent |
