# Adapters Overview

Sutures adapters connect your agent framework to the Sutures collector. Each adapter translates framework-specific events into the AgentEvent Protocol v1.0 and sends them over WebSocket.

## Adapter Comparison

| Feature | LangGraph | CrewAI | OpenAI Agents SDK | Generic |
|---|---|---|---|---|
| Integration effort | 3 lines | 3 lines | 3 lines | Manual |
| Breakpoint mechanism | `interrupt()` + `Command(resume=...)` | Callback hooks | Hook system | Manual pause/resume |
| Checkpoint sharing | SQLite (shared with collector) | Adapter-managed | Adapter-managed | Manual |
| Auto-checkpoint | Yes (on turn, handoff, breakpoint) | Yes | Yes | Optional |
| Memory hierarchy | Full (via `AsyncSqliteSaver`) | Basic | Basic | Manual |
| Thinking events | Yes (via `astream_events`) | Limited | Limited | Manual |
| Status | Primary | Planned (P2) | Planned (P3) | Available |

## How Adapters Work

```
Your Framework (LangGraph, CrewAI, etc.)
        |
        v
Framework Adapter (translates events)
        |
        v  WebSocket ws://localhost:9470/v1/events
        |
SUTURES COLLECTOR SERVER
```

1. The adapter **hooks into** your framework's event system (callbacks, stream events, hooks)
2. It **translates** framework-specific events into the 32 AgentEvent types
3. It **sends** events over WebSocket to the collector on port 9470
4. It **receives** breakpoint and injection commands from the collector
5. It **applies** those commands using the framework's official APIs

## WebSocket Connection

All adapters connect to `ws://localhost:9470/v1/events` and send messages in this format:

```json
{
  "type": "event",
  "payload": {
    "event_id": "01234567-89ab-cdef-0123-456789abcdef",
    "swarm_id": "my-swarm",
    "agent_id": "researcher",
    "timestamp": "2026-04-01T10:00:00.000Z",
    "event_type": "agent.spawned",
    "severity": "info",
    "data": { "name": "Researcher", "model": "claude-sonnet-4-20250514" },
    "protocol_version": "1.0.0"
  }
}
```

## Choosing an Adapter

- **LangGraph** — Best supported, full breakpoint integration via official APIs, shared SQLite checkpointing
- **CrewAI** — Coming in P2, uses CrewAI's callback system
- **OpenAI Agents SDK** — Coming in P3, uses the SDK's hook system
- **Generic** — Available now for any framework, requires manual event emission
