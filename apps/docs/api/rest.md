# REST API

The Sutures collector exposes a REST API on HTTP port 9471 for querying state and triggering actions. This API is read-oriented — for real-time control, use the [WebSocket API](/api/websocket).

## Base URL

```
http://localhost:9471
```

Configure with the `SUTURES_HTTP_PORT` environment variable.

## Endpoints

### `GET /health`

Health check endpoint. Returns server status and connection counts.

**Response:**

```json
{
  "status": "ok",
  "service": "sutures-collector",
  "adapters": 1,
  "dashboards": 2,
  "events": 347,
  "breakpoints": 3,
  "timestamp": "2026-04-01T10:05:00.000Z"
}
```

---

### `GET /api/topology`

Get the swarm topology graph.

**Query Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `swarm_id` | `string` | Optional. Filter to a specific swarm. |

**Response (with swarm_id):**

```json
{
  "topology": {
    "swarm_id": "research-swarm",
    "agents": {
      "researcher": {
        "agent_id": "researcher",
        "status": "completed",
        "name": "Researcher",
        "model": "claude-sonnet-4-20250514",
        "spawned_at": "2026-04-01T10:00:00.000Z",
        "completed_at": "2026-04-01T10:02:00.000Z"
      },
      "critic": { ... },
      "writer": { ... }
    },
    "edges": [
      {
        "from_agent_id": "researcher",
        "to_agent_id": "critic",
        "type": "handoff",
        "timestamp": "2026-04-01T10:01:30.000Z"
      }
    ],
    "updated_at": "2026-04-01T10:03:00.000Z"
  }
}
```

**Response (without swarm_id):**

```json
{
  "topologies": {
    "research-swarm": { ... },
    "analysis-swarm": { ... }
  }
}
```

---

### `GET /api/events`

Query events from the ring buffer.

**Query Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `swarm_id` | `string` | Optional. Filter by swarm. |
| `agent_id` | `string` | Optional. Filter by agent. |
| `limit` | `number` | Optional. Max events to return (default: 100). |

**Response:**

```json
{
  "events": [
    {
      "event_id": "01923abc-def0-7890-abcd-ef0123456789",
      "swarm_id": "research-swarm",
      "agent_id": "researcher",
      "timestamp": "2026-04-01T10:00:00.000Z",
      "event_type": "agent.spawned",
      "severity": "info",
      "data": { "name": "Researcher", "model": "claude-sonnet-4-20250514" },
      "protocol_version": "1.0.0"
    },
    ...
  ]
}
```

Events are returned in chronological order, limited to the most recent `limit` entries.

---

### `GET /api/checkpoints`

List checkpoints for a specific execution thread.

**Query Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `thread_id` | `string` | Yes | Execution thread ID. |

**Response:**

```json
{
  "checkpoints": [
    {
      "checkpoint_id": "cp-001",
      "thread_id": "thread-main",
      "agent_id": "researcher",
      "swarm_id": "research-swarm",
      "state": { ... },
      "memory_hierarchy": { "stm": {}, "mtm": {}, "ltm": {} },
      "parent_checkpoint_id": null,
      "created_at": "2026-04-01T10:01:00.000Z"
    }
  ]
}
```

**Error Response (missing thread_id):**

```json
{
  "error": "thread_id query parameter required"
}
```

---

### `GET /api/breakpoints`

List all active breakpoints.

**Response:**

```json
{
  "breakpoints": [
    {
      "breakpoint_id": "bp-abc123",
      "condition": "on_tool",
      "agent_id": "writer",
      "swarm_id": "research-swarm",
      "value": "write_document",
      "once": true
    }
  ]
}
```

---

### `POST /api/simulate`

Start the built-in demo simulation. Injects a 3-agent research swarm (Researcher, Critic, Writer) with events including handoffs, breakpoints, memory operations, and cost tracking.

**Request Body:** None required.

**Response:**

```json
{
  "status": "started",
  "message": "Demo simulation started"
}
```

The simulation runs asynchronously. Events appear on connected dashboards within a few seconds.

## CORS

The REST API has CORS enabled with `Access-Control-Allow-Origin: *` by default. Configure with the `corsOrigin` option in the collector config.

## Health Check on WebSocket Server

There is also a health endpoint on the WebSocket server (port 9470):

```
GET http://localhost:9470/health
```

This returns a similar health response but from the WebSocket server's perspective.
