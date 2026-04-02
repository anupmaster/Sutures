# A2A Adapter

Trace [Google A2A (Agent-to-Agent)](https://google.github.io/A2A/) protocol messages through Sutures. See task lifecycles, agent-to-agent handoffs, artifacts, and streaming updates in the live dashboard.

## Installation

```bash
pip install sutures-a2a
```

## Quick Start

```python
from sutures_a2a import SuturesA2AAdapter

adapter = SuturesA2AAdapter()
await adapter.connect()

# Decorator pattern — wraps your A2A task handler
@adapter.trace_task("my_agent", model="gpt-4o")
async def handle_task(task: dict) -> dict:
    result = await do_work(task)
    return {
        "id": task["id"],
        "status": {"state": "completed"},
        "message": {"role": "agent", "parts": [{"type": "text", "text": result}]},
    }
```

## Integration Patterns

### 1. Decorator (`@trace_task`)

Wraps an A2A task handler with full lifecycle tracing. Automatically emits `agent.spawned`, `turn.started`, `turn.completed`, and `agent.completed`/`agent.failed`.

```python
@adapter.trace_task("researcher", model="gpt-4o-mini", role="researcher")
async def handle_task(task: dict) -> dict:
    # Your A2A handler logic
    return {"id": task["id"], "status": {"state": "completed"}, ...}
```

### 2. Middleware (`wrap_handler`)

Same as the decorator, but applied inline:

```python
async def my_handler(task: dict) -> dict:
    ...

traced_handler = adapter.wrap_handler(my_handler, "my_agent", model="gpt-4o")
```

### 3. JSON-RPC Tracing (`trace_jsonrpc`)

Trace raw A2A JSON-RPC requests. Drop this into your HTTP handler:

```python
@app.post("/a2a")
async def handle(request):
    body = await request.json()
    adapter.trace_jsonrpc(body)  # Auto-detects tasks/send, tasks/cancel, etc.
    return await process(body)
```

### 4. Manual Lifecycle Events

Full control over what gets traced:

```python
# Task created
adapter.on_task_created("task-123", "researcher", model="gpt-4o")

# Status changes
adapter.on_task_status_changed("task-123", "working")

# Messages
adapter.on_message("task-123", "user", "Research quantum computing")
adapter.on_message("task-123", "agent", "Found 12 relevant papers...")

# Streaming updates (SSE)
adapter.on_streaming_update("task-123", "Searching knowledge base...")

# Artifacts
adapter.on_artifact("task-123", artifact_type="text", name="summary.md")

# Agent-to-agent delegation
adapter.on_push_notification(
    "task-456",
    source_agent="coordinator",
    target_agent="researcher",
    reason="Delegating research subtask",
)

# Cost tracking
adapter.emit_cost("task-123", "gpt-4o", input_tokens=1500, output_tokens=800, cost_usd=0.02)

# Task completed
adapter.on_task_status_changed("task-123", "completed", message="Done")
```

## Event Mapping

| A2A Concept | Sutures Event | Notes |
|---|---|---|
| Task created | `agent.spawned` | First time a task ID is seen |
| Task `working` | `turn.started` | Agent begins processing |
| Task `completed` | `agent.completed` | Agent finishes successfully |
| Task `failed` | `agent.failed` | Agent encounters an error |
| Task `canceled` | `agent.paused` | Task explicitly canceled |
| Task `input-required` | `agent.paused` | Waiting for user input |
| Message (user->agent) | `turn.started` | User sends input to agent |
| Message (agent->user) | `turn.completed` | Agent produces output |
| Artifact produced | `turn.observed` | File, data, or content artifact |
| Push notification | `handoff.initiated` | Agent delegates to another agent |
| Streaming update | `turn.thinking` | Partial/incremental response |

## Constructor Options

```python
adapter = SuturesA2AAdapter(
    collector_url="ws://localhost:9470/v1/events",  # Sutures collector WebSocket
    swarm_id="my-a2a-swarm",                        # Group agents under one swarm
)
```

## Example

See [`examples/a2a-task-agent/`](https://github.com/anupmaster/sutures/tree/main/examples/a2a-task-agent) for a complete working example with a multi-agent coordinator/researcher demo.
