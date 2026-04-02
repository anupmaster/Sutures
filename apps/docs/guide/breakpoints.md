# Breakpoints

Breakpoints are the core intervention mechanism in Sutures. They let you define conditions under which an agent should pause, allowing you to inspect state, inject corrections, and resume execution.

## How Breakpoints Work

1. **Set** a breakpoint with a condition (via dashboard, WebSocket command, or MCP tool)
2. The collector **evaluates** every incoming event against active breakpoints
3. When a condition matches, a `breakpoint.hit` event is emitted and the agent **pauses**
4. You **inspect** the agent's context window, memory, and state in the dashboard
5. Optionally **inject** new state or messages into the agent
6. **Release** the breakpoint to resume execution

## 13 Breakpoint Conditions

### Basic Conditions

| # | Condition | Trigger | Value |
|---|---|---|---|
| 1 | `always` | Every turn of target agent | — |
| 2 | `on_turn` | Specific turn number | `number` (e.g., `3`) |
| 3 | `on_tool` | Specific tool called | `string` (e.g., `"web_search"`) |
| 4 | `on_handoff` | Handoff from/to specific agent | `string` (agent ID) |
| 5 | `on_cost` | Cumulative cost exceeds threshold | `number` (USD, e.g., `0.50`) |
| 6 | `on_error` | Any error occurs | — |
| 7 | `on_score` | Quality score below threshold | `number` (e.g., `0.7`) |

### Memory Conditions

| # | Condition | Trigger | Value |
|---|---|---|---|
| 8 | `on_memory_tier_migration` | Memory moves between STM/MTM/LTM | — |
| 9 | `on_conflict_detected` | Contradictory facts in memory | — |
| 10 | `on_context_pressure` | Context window exceeds threshold | `number` (percentage, e.g., `85`) |
| 11 | `on_memory_structure_switch` | Agent changes memory organization | — |
| 12 | `on_memory_link_created` | New memory graph connection | — |
| 13 | `on_cache_coherence_violation` | Agent has stale shared memory | — |

## Setting Breakpoints

### Via Dashboard

Click the breakpoint icon on any agent node in the topology canvas, or use the Breakpoints panel to create conditions.

### Via WebSocket Command

```json
{
  "type": "command",
  "command": "set_breakpoint",
  "payload": {
    "condition": "on_tool",
    "agent_id": "writer",
    "swarm_id": "my-swarm",
    "value": "write_document",
    "once": true
  }
}
```

### Via MCP Tool

```
set_breakpoint(condition="on_cost", agent_id="researcher", value=0.50)
```

## Breakpoint Configuration

```typescript
{
  breakpoint_id?: string,  // Auto-generated UUID if omitted
  condition: string,       // One of 13 condition types
  agent_id?: string,       // Target agent (omit for all agents)
  swarm_id?: string,       // Target swarm (omit for all swarms)
  value?: unknown,         // Condition-specific threshold or matcher
  once?: boolean           // Single-shot breakpoint (auto-removed after hit)
}
```

## Injection After Breakpoint

When an agent is paused at a breakpoint, you can inject state or messages before resuming:

```json
{
  "type": "command",
  "command": "inject_and_resume",
  "payload": {
    "agent_id": "writer",
    "state": { "revised_outline": "..." },
    "messages": [
      { "role": "user", "content": "Focus on practical examples" }
    ],
    "mode": "append"
  }
}
```

The `mode` field controls how injected data is applied:
- **`append`** — Add to existing state/messages (default, works with LangGraph's `add_messages` reducer)
- **`replace`** — Overwrite existing state/messages

## LangGraph Integration

For LangGraph, breakpoints use the official async APIs:

- `interrupt()` pauses execution
- `Command(resume=...)` resumes with optional state updates
- `update_state()` runs through reducers (appends for `add_messages`, merges for custom)
- `astream_events` yields `on_interrupt` and the stream stays alive through pauses

::: warning
Never use `threading.Event` or `asyncio.Event` for LangGraph breakpoints — this causes deadlocks with LangGraph's async TaskGroup execution.
:::
