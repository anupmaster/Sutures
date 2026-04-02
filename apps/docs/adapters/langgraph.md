# LangGraph Adapter

The LangGraph adapter is the primary and best-supported adapter for Sutures. It uses LangGraph's official async APIs for breakpoints and shares the SQLite checkpoint database with the collector.

## Requirements

- Python 3.10+
- LangGraph >= 1.1.3
- `langchain-core`
- `websockets`

## Installation

```bash
pip install sutures-langgraph
```

## Integration (3 Lines)

```python
from sutures import SuturesAdapter

tracer = SuturesAdapter(swarm_id="research-swarm")
app = graph.compile(checkpointer=tracer)
```

## Full Example

```python
from langgraph.graph import StateGraph, MessagesState
from langchain_anthropic import ChatAnthropic
from sutures import SuturesAdapter

# Define your graph
model = ChatAnthropic(model="claude-sonnet-4-20250514")

def researcher(state: MessagesState):
    return {"messages": [model.invoke(state["messages"])]}

def writer(state: MessagesState):
    return {"messages": [model.invoke(state["messages"])]}

graph = StateGraph(MessagesState)
graph.add_node("researcher", researcher)
graph.add_node("writer", writer)
graph.add_edge("researcher", "writer")
graph.set_entry_point("researcher")

# Attach Sutures (3 lines)
tracer = SuturesAdapter(swarm_id="research-swarm")
app = graph.compile(checkpointer=tracer)

# Run
result = await app.ainvoke(
    {"messages": [("user", "Research multi-agent memory architectures")]},
    config={"configurable": {"thread_id": "thread-1"}}
)
```

## Breakpoint Integration

The LangGraph adapter uses the official async breakpoint APIs:

### `interrupt()` — Pause Execution

When a breakpoint condition is met, the adapter calls `interrupt()` which pauses the graph execution. The `astream_events` stream yields an `on_interrupt` event and **stays alive** (no reconnection needed).

### `Command(resume=...)` — Resume with State

When you release a breakpoint (optionally with injected state), the adapter creates a `Command(resume=value)` to continue execution.

### `update_state()` — Inject State

For state injection, `update_state()` runs through the graph's reducers:
- For `add_messages` reducer: messages are **appended**
- For custom reducers: state is **merged**

The Injection Editor in the dashboard provides an Append vs Replace toggle based on the reducer type.

::: danger Important
Never use `threading.Event` or `asyncio.Event` for breakpoints. LangGraph v1.1.3 uses async TaskGroup execution, and blocking primitives cause deadlocks. Always use the official `interrupt()` + `Command(resume=...)` pattern.
:::

## Checkpointing

The adapter uses `AsyncSqliteSaver` sharing the same SQLite database file as the collector:

```python
tracer = SuturesAdapter(
    swarm_id="research-swarm",
    checkpoint_db="sutures-checkpoints.db"  # Shared with collector
)
```

This enables zero-copy checkpoint access — the dashboard and MCP tools can read checkpoints directly without any data transfer.

## Shadow Mode

Shadow agents use `InMemorySaver` (not the shared SQLite) to avoid write contention:

```python
# The adapter handles this internally
tracer.spawn_shadow(thread_id="thread-1", checkpoint_id="cp-001")
```

Only the winning shadow path is persisted via `aupdate_state` when promoted.

## Configuration

```python
tracer = SuturesAdapter(
    swarm_id="my-swarm",
    ws_url="ws://localhost:9470/v1/events",
    checkpoint_db="sutures-checkpoints.db",
    auto_checkpoint=True,    # Checkpoint on turn, handoff, breakpoint
    emit_thinking=True,      # Include turn.thinking events
    emit_memory=True,        # Include memory.read/write events
)
```
