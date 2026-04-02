# MCP Integration

Sutures exposes 18 MCP (Model Context Protocol) tools, letting AI IDEs like Claude Code and Cursor debug your agent swarms directly. This is the key differentiator: your AI tools can debug your AI agents.

## What is MCP?

The Model Context Protocol is a standard for connecting AI assistants to external tools and data sources. Sutures implements an MCP server that exposes its debugging capabilities as callable tools.

## Starting the MCP Server

```bash
sutures mcp
```

This starts the MCP server using stdio transport, which is the standard for local MCP connections.

## Available Tools (18)

### Topology (5)

| Tool | Description |
|---|---|
| `list_agents` | List all active agents with status, model, and role |
| `get_agent_state` | Get full state for a specific agent |
| `get_topology` | Get the swarm topology graph (agents + edges) |
| `get_errors` | List all error events across the swarm |
| `get_swarm_summary` | High-level summary: agent count, status breakdown, cost |

### Memory (5)

| Tool | Description |
|---|---|
| `get_context_window` | See exactly what an agent has in its context |
| `get_memory_hierarchy` | View STM/MTM/LTM contents for an agent |
| `get_shared_memory_map` | See all shared memory keys with readers/writers |
| `get_memory_traversal_path` | Trace how a memory key was accessed and modified |
| `simulate_prune` | Preview what would be pruned at a given pressure level |

### Breakpoints (5)

| Tool | Description |
|---|---|
| `set_breakpoint` | Set a breakpoint with any of 13 conditions |
| `release_breakpoint` | Remove a breakpoint by ID |
| `inject_and_resume` | Inject state/messages and resume a paused agent |
| `get_checkpoints` | List all checkpoints for a thread |
| `fork_from_checkpoint` | Create a forked execution from a checkpoint |

### Analysis (3)

| Tool | Description |
|---|---|
| `get_root_cause` | AI-powered root cause analysis for agent failures |
| `get_cost_breakdown` | Detailed cost breakdown by agent, model, and tool |
| `export_trace` | Export full trace for offline analysis or sharing |

## Setup with Claude Code

Add Sutures as an MCP server in your Claude Code configuration:

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

Then in Claude Code, you can say things like:
- "List all agents in my swarm"
- "What's in the researcher's context window?"
- "Set a breakpoint when cost exceeds $0.50"
- "Show me the root cause of the writer's failure"
- "Fork from the last checkpoint and retry with a different prompt"

## Setup with Cursor

Add to your Cursor MCP settings:

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

## Workflow Example

1. Start your agent swarm with the Sutures adapter
2. Open Claude Code with the Sutures MCP server configured
3. Ask Claude: "What agents are running and what's their status?"
4. Claude calls `list_agents` and reports back
5. Ask: "Set a breakpoint on the writer when it calls write_document"
6. Claude calls `set_breakpoint(condition="on_tool", agent_id="writer", value="write_document")`
7. When the breakpoint hits, ask: "What's in the writer's context window?"
8. Claude calls `get_context_window(agent_id="writer")`
9. Ask: "Inject a message telling it to focus on code examples, then resume"
10. Claude calls `inject_and_resume(agent_id="writer", messages=[...])`

This creates a feedback loop where your AI IDE actively debugs your AI agents.
