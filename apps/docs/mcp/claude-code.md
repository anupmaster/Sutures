# Setup with Claude Code

This guide walks you through configuring Sutures as an MCP server in Claude Code, enabling your AI assistant to debug your agent swarms directly.

## Prerequisites

- Claude Code installed
- Sutures installed and built (`pnpm install && pnpm build`)

## Configuration

Add Sutures to your Claude Code MCP configuration. Create or edit your project's `.mcp.json`:

```json
{
  "mcpServers": {
    "sutures": {
      "command": "npx",
      "args": ["sutures", "mcp"]
    }
  }
}
```

Or if running from a local checkout:

```json
{
  "mcpServers": {
    "sutures": {
      "command": "node",
      "args": ["./path/to/sutures/bin/sutures.js", "mcp"]
    }
  }
}
```

## Verify Connection

After configuration, restart Claude Code. You should see Sutures listed in your available MCP tools. Test with:

> "List all available Sutures tools"

Claude should enumerate the 18 tools across Topology, Memory, Breakpoints, and Analysis categories.

## Usage Patterns

### Monitoring a Running Swarm

```
You: "What agents are running and what's their status?"
Claude: [calls list_agents] "There are 3 agents: Researcher (thinking),
        Critic (idle), Writer (idle). The researcher is on turn 2."

You: "How much has it cost so far?"
Claude: [calls get_cost_breakdown] "Total: $0.012. Researcher: $0.012
        (claude-sonnet-4-20250514). Critic and Writer haven't started yet."
```

### Debugging a Failure

```
You: "The writer failed — what happened?"
Claude: [calls get_errors, get_root_cause] "The writer failed at turn 1
        with a context overflow. Root cause: the researcher's output was
        8,200 tokens and the writer's system prompt is 3,000 tokens,
        leaving insufficient room for generation. Recommendation:
        summarize research output before passing to writer."
```

### Setting Up Intervention

```
You: "Set a breakpoint on the writer when it calls write_document"
Claude: [calls set_breakpoint] "Breakpoint bp-abc123 set on 'writer'
        for tool call 'write_document'."

[Later, breakpoint hits]

You: "What's in the writer's context window right now?"
Claude: [calls get_context_window] "The writer has 12,500 tokens in
        context: system prompt (3,000), research results (8,200),
        evaluation (1,300). Context pressure: 78%."

You: "Inject a message telling it to write a concise 500-word summary
      instead, then resume"
Claude: [calls inject_and_resume] "Injected message and resumed the
        writer. Breakpoint released."
```

### Fork & Replay

```
You: "Show me the checkpoints for this run"
Claude: [calls get_checkpoints] "3 checkpoints: cp-001 (researcher
        turn 2), cp-002 (before handoff to critic), cp-003 (before
        handoff to writer)."

You: "Fork from cp-002 — I want to try with a different critic prompt"
Claude: [calls fork_from_checkpoint] "Forked from cp-002. New thread:
        thread-main:fork:a1b2c3d4. You can now run the critic with
        modified parameters on this fork."
```

## Tips

- Start conversations with "Give me a swarm summary" to orient yourself
- Use `get_context_window` liberally — it is the most powerful debugging tool
- Combine `set_breakpoint` with `get_memory_hierarchy` to inspect memory at critical moments
- Use `simulate_prune` before your agents hit context limits to plan pruning strategies
