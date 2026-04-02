# Quick Start (3 Lines)

Sutures is designed to be integrated into any agent framework with minimal code. Each adapter follows the same pattern: import, initialize, attach.

## LangGraph

```python
from sutures import SuturesAdapter          # 1. Import
tracer = SuturesAdapter(swarm_id="my-swarm") # 2. Initialize
app = graph.compile(checkpointer=tracer)     # 3. Attach
```

The LangGraph adapter uses the official `interrupt()` + `Command(resume=...)` APIs for breakpoints. It shares the SQLite checkpoint database with the collector for zero-copy state access.

## CrewAI

```python
from sutures import SuturesAdapter          # 1. Import
tracer = SuturesAdapter(swarm_id="my-crew")  # 2. Initialize
crew = Crew(agents=[...], callbacks=[tracer]) # 3. Attach
```

The CrewAI adapter hooks into CrewAI's callback system to emit events for agent lifecycle, tool usage, and handoffs.

## OpenAI Agents SDK

```python
from sutures import SuturesAdapter            # 1. Import
tracer = SuturesAdapter(swarm_id="my-agents")  # 2. Initialize
runner = Runner(agent=agent, hooks=[tracer])    # 3. Attach
```

## Generic (Any Framework)

For custom frameworks or manual instrumentation:

```python
from sutures import SuturesAdapter

tracer = SuturesAdapter(swarm_id="custom-swarm")

# Emit events manually
tracer.emit("agent.spawned", agent_id="planner", data={"name": "Planner", "model": "claude-sonnet-4-20250514"})
tracer.emit("turn.started", agent_id="planner", data={"turn_number": 1, "input": "Plan the task"})
tracer.emit("turn.acting", agent_id="planner", data={"tool_name": "search", "tool_input_summary": "query"})
tracer.emit("turn.completed", agent_id="planner", data={"turn_number": 1, "output_summary": "Done"})
```

You can also use the decorator and context manager patterns:

```python
@tracer.trace_agent("researcher")
async def research(query: str):
    # Agent logic here — events emitted automatically
    pass

async with tracer.trace_turn("researcher", turn=1):
    # Turn events emitted on enter/exit
    result = await call_model(prompt)
```

## Verify Connection

After starting your agent system with the adapter:

1. Open the Sutures dashboard at `http://localhost:9472`
2. You should see agents appear on the topology canvas as they spawn
3. Events stream in real-time in the timeline panel

## Configuration Options

```python
tracer = SuturesAdapter(
    swarm_id="my-swarm",
    ws_url="ws://localhost:9470/v1/events",  # Collector WebSocket
    checkpoint_db="sutures-checkpoints.db",   # Shared SQLite path
    auto_checkpoint=True,                     # Auto-create checkpoints
    emit_thinking=True,                       # Include thinking events
)
```

## Next Steps

- [Event Protocol](/guide/event-protocol) — All 32 event types your adapter can emit
- [Breakpoints](/guide/breakpoints) — Set up pause conditions
- [Adapter Details](/adapters/overview) — Deep dive into each framework adapter
