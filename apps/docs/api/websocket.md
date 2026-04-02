# WebSocket API

The Sutures collector exposes two WebSocket endpoints for real-time communication with adapters and dashboard clients.

## Endpoints

| Endpoint | Port | Purpose |
|---|---|---|
| `ws://localhost:9470/v1/events` | 9470 | Adapter connections (send events) |
| `ws://localhost:9470/v1/dashboard` | 9470 | Dashboard connections (receive events, send commands) |
| `ws://localhost:9470/health` | 9470 | Health check (HTTP, not WebSocket) |

## Inbound Message Types

All WebSocket messages are JSON with a `type` discriminator field.

### `event` — Adapter Events

Sent by adapters to report agent events.

```json
{
  "type": "event",
  "payload": {
    "event_id": "01923abc-def0-7890-abcd-ef0123456789",
    "swarm_id": "research-swarm",
    "agent_id": "researcher",
    "timestamp": "2026-04-01T10:00:00.000Z",
    "event_type": "agent.spawned",
    "severity": "info",
    "data": {
      "name": "Researcher",
      "role": "research",
      "model": "claude-sonnet-4-20250514",
      "tools": ["web_search", "arxiv_search"]
    },
    "protocol_version": "1.0.0"
  }
}
```

### `command` — Dashboard Commands

Sent by dashboard clients to control the system.

```json
{
  "type": "command",
  "command": "<command_name>",
  "payload": { ... }
}
```

Available commands:

| Command | Payload | Description |
|---|---|---|
| `set_breakpoint` | `BreakpointConfig` | Set a new breakpoint |
| `release_breakpoint` | `{ breakpoint_id }` | Remove a breakpoint |
| `inject_and_resume` | `{ agent_id, state?, messages?, mode? }` | Inject state and resume |
| `get_checkpoints` | `{ thread_id }` | List checkpoints for a thread |
| `fork_from_checkpoint` | `{ checkpoint_id }` | Fork execution from checkpoint |
| `get_topology` | `{ swarm_id? }` | Get topology (all or specific swarm) |
| `get_events` | `{ swarm_id?, agent_id?, limit? }` | Query events |
| `pause_all` | `{ swarm_id? }` | Pause all agents |
| `resume_all` | `{ swarm_id? }` | Resume all agents |

### `session` — Collaborative Sessions

Sent by dashboard clients for multi-user collaboration.

```json
{
  "type": "session",
  "payload": {
    "action": "join" | "leave" | "cursor" | "selection",
    "session_id": "optional",
    "user_name": "Alice",
    "cursor": { "node_id": "researcher", "panel": "inspector", "x": 250, "y": 180 },
    "selected_agent_id": "researcher"
  }
}
```

## Outbound Message Types

Messages sent from the collector to connected clients.

### `event` — Event Broadcast

All agent events are broadcast to dashboard clients.

```json
{
  "type": "event",
  "payload": { /* AgentEvent */ }
}
```

### `response` — Command Response

Responses to dashboard commands.

```json
{
  "type": "response",
  "command": "set_breakpoint",
  "data": { "breakpoint_id": "bp-abc123" }
}
```

### `topology` — Topology Update

Full topology state, sent on structural changes (agent spawn, handoff).

```json
{
  "type": "topology",
  "payload": {
    "swarm_id": "research-swarm",
    "agents": {
      "researcher": {
        "agent_id": "researcher",
        "status": "thinking",
        "name": "Researcher",
        "model": "claude-sonnet-4-20250514",
        "spawned_at": "2026-04-01T10:00:00.000Z"
      }
    },
    "edges": [
      {
        "from_agent_id": "researcher",
        "to_agent_id": "critic",
        "type": "handoff",
        "timestamp": "2026-04-01T10:01:00.000Z"
      }
    ],
    "updated_at": "2026-04-01T10:01:00.000Z"
  }
}
```

### `anomaly` — Anomaly Alert

Sent when the anomaly engine detects a problem.

```json
{
  "type": "anomaly",
  "payload": {
    "type": "infinite_loop",
    "agent_id": "researcher",
    "swarm_id": "research-swarm",
    "message": "Agent 'researcher' has completed 15 turns without finishing",
    "severity": "error",
    "detected_at": "2026-04-01T10:05:00.000Z",
    "details": { "turn_count": 15 }
  }
}
```

### `session` — Session Update

Collaborative session events broadcast to other dashboard clients.

```json
{
  "type": "session",
  "payload": {
    "action": "join",
    "session_id": "a1b2c3d4",
    "user_name": "Alice",
    "color": "#10B981",
    "active_sessions": [ ... ]
  }
}
```

## Connection Lifecycle

### Dashboard Connection

1. Client connects to `ws://localhost:9470/v1/dashboard`
2. Server immediately sends current topology state for all active swarms
3. Server sends the last 500 events from the ring buffer
4. Client is now receiving live events
5. On disconnect, collaborative session is cleaned up

### Adapter Connection

1. Client connects to `ws://localhost:9470/v1/events`
2. Client begins sending events as they occur
3. Server validates each event against the Zod schema
4. Server may send back `breakpoint.hit` events that the adapter should handle
5. Server may send `breakpoint.inject` events with state to apply

## Error Handling

Invalid messages receive an error response:

```json
{
  "type": "response",
  "command": "error",
  "data": { "error": "Validation error: event_type is required" }
}
```
