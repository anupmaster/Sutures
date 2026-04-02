# Sutures + Generic Adapter -- No API Key Needed

Demonstrates all three instrumentation patterns of the framework-agnostic Sutures adapter. This example simulates agent behavior with `print()` and `sleep()` -- no LLM API key required.

## Setup

```bash
# 1. Start the Sutures collector + dashboard
npx sutures

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Run the example (no API key needed!)
python main.py

# 4. Open the dashboard
open http://localhost:9472
```

## Three Instrumentation Patterns

### Pattern 1: `@adapter.trace_agent()` decorator

Automatically emits `agent.spawned`, `turn.started`, and `turn.completed` events.

```python
@adapter.trace_agent("Researcher", model="gpt-4o", tools=["search"])
def run_researcher(query: str) -> str:
    return do_research(query)
```

### Pattern 2: `adapter.agent_span()` context manager

Explicit control over agent lifecycle. Emits `agent.spawned` on enter, `agent.completed` on exit.

```python
with adapter.agent_span("Analyst", model="claude-3") as span:
    result = analyze(data)
    span["output"] = result
```

### Pattern 3: `adapter.emit()` manual emission

Full control. Construct and emit each event yourself.

```python
adapter.emit("Writer", "turn.started", {"turn_number": 1, "input": "..."})
adapter.emit("Writer", "turn.completed", {"turn_number": 1, "output_summary": "..."})
```

## Additional Helpers

```python
# Emit handoffs between agents
adapter.emit_handoff("Researcher", "Writer", reason="research complete")

# Emit cost/token events
adapter.emit_cost("Researcher", "gpt-4o", input_tokens=500, output_tokens=200, cost_usd=0.005)

# Trace tool calls
@adapter.trace_tool("web_search")
def web_search(query: str) -> str:
    return search(query)
```
