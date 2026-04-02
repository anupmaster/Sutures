# Generic Adapter (Any Framework)

The generic adapter lets you instrument any agent framework — or even raw Python/TypeScript code — by manually emitting events. It provides decorators, context managers, and a direct API.

## Installation

```bash
pip install sutures
```

## Direct API

The simplest approach — emit events explicitly:

```python
from sutures import SuturesAdapter

tracer = SuturesAdapter(swarm_id="custom-swarm")

# Agent lifecycle
tracer.emit("agent.spawned", agent_id="planner", data={
    "name": "Planner",
    "role": "planning",
    "model": "claude-sonnet-4-20250514",
    "tools": ["create_plan", "assign_tasks"],
})

# Reasoning turn
tracer.emit("turn.started", agent_id="planner", data={
    "turn_number": 1,
    "input": "Create a research plan",
    "input_tokens": 150,
})

tracer.emit("turn.acting", agent_id="planner", data={
    "tool_name": "create_plan",
    "tool_input_summary": "Research plan for memory architectures",
})

tracer.emit("turn.observed", agent_id="planner", data={
    "tool_name": "create_plan",
    "tool_output_summary": "Plan created with 5 subtasks",
    "output_tokens": 300,
})

tracer.emit("turn.completed", agent_id="planner", data={
    "turn_number": 1,
    "output_summary": "Research plan finalized",
    "duration_ms": 2500,
})

# Cost tracking
tracer.emit("cost.tokens", agent_id="planner", data={
    "model": "claude-sonnet-4-20250514",
    "input_tokens": 150,
    "output_tokens": 300,
    "cost_usd": 0.003,
    "cumulative_cost_usd": 0.003,
})

# Handoff
tracer.emit("handoff.initiated", agent_id="planner", data={
    "source_agent_id": "planner",
    "target_agent_id": "researcher",
    "reason": "Plan ready, begin research",
})

# Memory
tracer.emit("memory.write", agent_id="planner", data={
    "key": "research_plan",
    "value": "5 subtasks covering memory tiers, conflict resolution...",
    "tier": "stm",
    "shared": True,
    "reader_agent_ids": ["researcher", "writer"],
})

# Completion
tracer.emit("agent.completed", agent_id="planner", data={
    "total_cost_usd": 0.003,
})
```

## Decorator Pattern

Automatically emit lifecycle and turn events:

```python
@tracer.trace_agent("researcher")
async def research(query: str):
    # agent.spawned emitted on first call
    # agent.completed emitted when function returns
    results = await search(query)
    return results
```

## Context Manager Pattern

Fine-grained control over turn events:

```python
async with tracer.trace_turn("researcher", turn=1) as turn:
    # turn.started emitted on enter
    turn.set_input("Research memory architectures")

    result = await call_model(prompt)
    turn.set_output(result.content)

    # turn.completed emitted on exit
```

## Checkpoint Support

Create checkpoints manually for fork & replay:

```python
tracer.emit("checkpoint.created", agent_id="researcher", data={
    "checkpoint_id": "cp-001",
    "thread_id": "thread-main",
    "state": {"messages": [...], "findings": [...]},
    "memory_hierarchy": {
        "stm": {"research_plan": "..."},
        "mtm": {},
        "ltm": {},
    },
})
```

## Breakpoint Handling

The generic adapter receives breakpoint commands over WebSocket. Implement a pause handler:

```python
tracer = SuturesAdapter(swarm_id="custom-swarm")

@tracer.on_breakpoint_hit
async def handle_breakpoint(event):
    # Agent is paused — wait for release
    print(f"Breakpoint hit on {event['agent_id']}")
    # The adapter handles the pause/resume loop internally

@tracer.on_inject
async def handle_injection(event):
    # Apply injected state/messages
    state = event["data"].get("state", {})
    messages = event["data"].get("messages", [])
    mode = event["data"].get("mode", "append")
    # Apply to your agent...
```

## Configuration

```python
tracer = SuturesAdapter(
    swarm_id="custom-swarm",
    ws_url="ws://localhost:9470/v1/events",
    auto_checkpoint=False,   # Manual checkpoints for generic
    emit_thinking=True,
)
```
