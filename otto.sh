#!/bin/bash
# Otto - The Ralph Wiggum Technique for AI-assisted development
#
# Usage: ./otto.sh [plan] [max_iterations]
# Examples:
#   ./otto.sh              # Build mode, unlimited iterations
#   ./otto.sh 20           # Build mode, max 20 iterations
#   ./otto.sh plan         # Plan mode, unlimited iterations
#   ./otto.sh plan 5       # Plan mode, max 5 iterations

# Spinner animation for streaming mode
spinner_pid=""
show_spinner=false

start_spinner() {
    show_spinner=true
    local delay=0.1
    local spinchars='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
    local i=0

    # Run in background, output to stderr to not interfere with main output
    (
        while [ "$show_spinner" = true ]; do
            local char="${spinchars:$((i % ${#spinchars})):1}"
            echo -ne "\r\033[K  🦦 \033[1;36m$char\033[0m " >&2
            sleep $delay
            i=$((i + 1))
        done
        # Clear the spinner line when done
        echo -ne "\r\033[K" >&2
    ) &
    spinner_pid=$!
}

stop_spinner() {
    show_spinner=false
    if [ -n "$spinner_pid" ]; then
        kill "$spinner_pid" 2>/dev/null || true
        wait $spinner_pid 2>/dev/null || true
        spinner_pid=""
    fi
    # Ensure clean line
    echo -ne "\r\033[K" >&2
}

# Cleanup function for Ctrl+C
cleanup() {
    echo -e "\n\n⚠️  Interrupted. Cleaning up..."
    stop_spinner
    exit 130
}

# Trap Ctrl+C (SIGINT)
trap cleanup SIGINT

# Parse arguments
if [ "$1" = "plan" ]; then
    # Plan mode
    MODE="plan"
    PROMPT_FILE="PROMPT_plan.md"
    MAX_ITERATIONS=${2:-0}
elif [[ "$1" =~ ^[0-9]+$ ]]; then
    # Build mode with max iterations
    MODE="build"
    PROMPT_FILE="PROMPT_build.md"
    MAX_ITERATIONS=$1
else
    # Build mode, unlimited (no arguments or invalid input)
    MODE="build"
    PROMPT_FILE="PROMPT_build.md"
    MAX_ITERATIONS=0
fi

ITERATION=0
CURRENT_BRANCH=$(git branch --show-current)
LAST_PLAN_HASH=""

# Plan mode exit conditions
check_plan_exit() {
    if [ "$MODE" != "plan" ]; then
        return 1
    fi

    # Exit if specs/ is empty or doesn't exist
    if [ ! -d "specs" ] || [ -z "$(ls -A specs/ 2>/dev/null)" ]; then
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        echo "Plan mode: No specs found in specs/"
        echo "Exiting loop."
        echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
        return 0
    fi

    # Exit if IMPLEMENTATION_PLAN.md hasn't changed (stable)
    if [ -f "IMPLEMENTATION_PLAN.md" ]; then
        # Use md5 of working directory file (not git object)
        CURRENT_HASH=$(md5 -q IMPLEMENTATION_PLAN.md)
        if [ -n "$LAST_PLAN_HASH" ] && [ "$CURRENT_HASH" = "$LAST_PLAN_HASH" ]; then
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo "Plan mode: Plan is stable (no changes)"
            echo "Exiting loop."
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            return 0
        fi
        LAST_PLAN_HASH="$CURRENT_HASH"
    fi

    return 1
}

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "Otto Loop"
echo "Mode:   $MODE"
echo "Prompt: $PROMPT_FILE"
echo "Branch: $CURRENT_BRANCH"
[ $MAX_ITERATIONS -gt 0 ] && echo "Max:    $MAX_ITERATIONS iterations"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Verify prompt file exists
if [ ! -f "$PROMPT_FILE" ]; then
    echo "Error: $PROMPT_FILE not found"
    exit 1
fi

while true; do
    # Check plan mode exit conditions
    if check_plan_exit; then
        break
    fi

    if [ $MAX_ITERATIONS -gt 0 ] && [ $ITERATION -ge $MAX_ITERATIONS ]; then
        echo "Reached max iterations: $MAX_ITERATIONS"
        break
    fi

    # Run Otto iteration with selected prompt
    # -p: Headless mode (non-interactive, reads from stdin)
    # --dangerously-skip-permissions: Auto-approve all tool calls (YOLO mode)
    # --output-format=json: Get structured output for parsing
    # --model opus: Primary agent uses Opus for complex reasoning

    start_spinner

    # Capture JSON output (stderr to /dev/null to suppress noise)
    temp_output=$(mktemp)
    cat "$PROMPT_FILE" | claude -p \
        --dangerously-skip-permissions \
        --output-format=json \
        --model MiniMax-M2.5 \
        2>/dev/null > "$temp_output"

    stop_spinner

    # Parse and display JSON output with nice formatting
    if command -v jq &> /dev/null; then
        # Check if we have valid JSON with result field
        if jq -e '.result' "$temp_output" >/dev/null 2>&1; then
            # Show main text response
            result_text=$(jq -r '.result' "$temp_output")
            echo ""
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo "  💬 Response"
            echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
            echo "$result_text"
            echo ""

            # Show tool calls from iterations if any
            if jq -e '.iterations[]' "$temp_output" >/dev/null 2>&1; then
                echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
                echo "  🔧 Tool Calls"
                echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

                jq -r '.iterations[]? | to_entries[] | select(.key == "tool") | .value[]? | to_entries[] | select(.key == "name" or .key == "input") | "\(.key): \(.value)"' "$temp_output" 2>/dev/null | while read -r line; do
                    echo "  $line"
                done
            fi
        else
            # Fallback: show raw output if parsing fails
            cat "$temp_output"
        fi
    else
        # No jq, show raw output
        cat "$temp_output"
    fi

    # Also save raw JSON to log file for debugging
    echo "=== Iteration $ITERATION ===" >> otto.log
    cat "$temp_output" >> otto.log
    echo "" >> otto.log

    rm -f "$temp_output"

    # Push changes after each iteration
    git push origin "$CURRENT_BRANCH" || {
        echo "Failed to push. Creating remote branch..."
        git push -u origin "$CURRENT_BRANCH"
    }

    ITERATION=$((ITERATION + 1))

    # Show iteration banner (don't clear - keep previous output visible for debugging)
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "  Otto Loop"
    echo "  Iteration: $ITERATION"
    [ $MAX_ITERATIONS -gt 0 ] && echo "  Max: $MAX_ITERATIONS"
    echo "  Branch: $CURRENT_BRANCH"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
done
