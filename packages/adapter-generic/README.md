# sutures-generic

Framework-agnostic [Sutures](https://github.com/anupmaster/Sutures) adapter. Instrument **any** agent system with live debugging, conditional breakpoints, and real-time event streaming.

## Install

```bash
pip install sutures-generic
```

## Quick Start

```python
import asyncio
from sutures_generic import SuturesAdapter

adapter = SuturesAdapter(collector_url="ws://localhost:9470/v1/events")

async def main():
    await adapter.connect()

    # ... run your agents ...

    await adapter.close()

asyncio.run(main())
```

## Decorators

Trace agent functions and tool calls with zero boilerplate:

```python
@adapter.trace_agent("researcher", model="gpt-4o", tools=["search", "read"])
async def run_researcher(query: str) -> str:
    results = await search(query)
    return summarize(results)

@adapter.trace_agent("writer", model="claude-3-opus")
def run_writer(outline: str) -> str:
    return generate_draft(outline)

@adapter.trace_tool("web_search")
def web_search(query: str) -> str:
    return requests.get(f"https://api.search.com?q={query}").text
```

- `trace_agent` emits `agent.spawned` on first call, `turn.started` / `turn.completed` on each call
- `trace_tool` emits `turn.acting` / `turn.observed` around execution
- Both handle sync and async functions automatically

## Context Managers

For more control over span boundaries:

```python
with adapter.agent_span("planner", model="gpt-4o") as span:
    plan = create_plan(task)
    span["output"] = plan

with adapter.tool_span("database_query", agent_name="planner") as span:
    rows = db.execute(sql)
    span["output"] = f"{len(rows)} rows"
```

- `agent_span` emits `agent.spawned` on enter, `agent.completed` / `agent.failed` on exit
- `tool_span` emits `turn.acting` on enter, `turn.observed` on exit

## Manual Emission

Full control over event emission:

```python
# Any event type
adapter.emit("researcher", "memory.write", {"key": "findings", "value": "..."})

# Handoffs between agents
adapter.emit_handoff("researcher", "writer", reason="research complete")

# Cost tracking
adapter.emit_cost("researcher", model="gpt-4o", input_tokens=1500, output_tokens=300, cost_usd=0.02)
```

## Requirements

- Python 3.10+
- Sutures collector running on port 9470
