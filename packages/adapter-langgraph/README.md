# sutures-langgraph

**Sutures adapter for LangGraph** -- breakpoints for AI agents.

The first open-source visual debugger with live intervention for LangGraph multi-agent systems. Instrument your graphs with conditional breakpoints, state injection, time-travel debugging, and real-time event streaming.

## Installation

```bash
pip install sutures-langgraph
```

## Quick Start (3 Lines)

The simplest integration uses `SuturesTracer` as a LangChain callback handler. No breakpoints, just real-time tracing:

```python
from sutures_langgraph import SuturesTracer

tracer = SuturesTracer(agent_name="my-agent", model="gpt-4o")
result = await graph.ainvoke(inputs, config={"callbacks": [tracer]})
```

Events stream to the Sutures collector at `ws://localhost:9470/v1/events`.

## Full Breakpoint Support

For conditional breakpoints, state injection, and time-travel:

```python
from sutures_langgraph import SuturesLangGraphAdapter

# 1. Create adapter
adapter = SuturesLangGraphAdapter(
    agent_name="research-agent",
    model="claude-sonnet-4-20250514",
)

# 2. Instrument your graph (wraps nodes with breakpoint checks)
graph = await adapter.instrument_graph(builder, thread_id="thread-1")

# 3. Set breakpoints
await adapter.add_breakpoint("on_tool", params={"tool_name": "web_search"})
await adapter.add_breakpoint("on_cost", params={"max_usd": 0.50})
await adapter.add_breakpoint("on_error")

# 4. Run with breakpoint support
async for event in adapter.run_with_breakpoints(graph, inputs, "thread-1"):
    print(event["event"], event.get("name", ""))
```

## Breakpoint Conditions

All 13 conditions are evaluated locally for <10ms latency:

| Condition | Description |
|-----------|-------------|
| `always` | Pause before every node |
| `on_turn` | Pause at turn boundaries (optionally at specific turn number) |
| `on_tool` | Pause before tool execution (optionally for specific tool) |
| `on_handoff` | Pause on agent handoffs |
| `on_cost` | Pause when cumulative cost exceeds threshold |
| `on_error` | Pause when errors are detected |
| `on_score` | Pause when confidence drops below threshold |
| `on_memory_tier_migration` | Pause on memory tier changes |
| `on_conflict_detected` | Pause on memory conflicts |
| `on_context_pressure` | Pause when context window is filling up |
| `on_memory_structure_switch` | Pause on memory structure changes |
| `on_memory_link_created` | Pause when memory links are created |
| `on_cache_coherence_violation` | Pause on cache coherence issues |

## Intervention: Resume, Inject, Fork

```python
# Resume from breakpoint
async for event in adapter.resume("thread-1", resume_value="continue"):
    print(event)

# Inject state and resume (state goes through LangGraph reducers)
async for event in adapter.resume(
    "thread-1",
    injection={"messages": [HumanMessage(content="Try a different approach")]},
):
    print(event)

# Time-travel: inspect history
history = await adapter.get_state_history("thread-1")

# Fork from a past checkpoint
fork_id = await adapter.fork_from_checkpoint(
    "thread-1",
    checkpoint_config=history[3]["config"],
    new_state={"messages": [HumanMessage(content="New direction")]},
)
async for event in adapter.resume(fork_id):
    print(event)
```

## Event Protocol

The adapter emits all 32 Sutures AgentEvent types:

- **Lifecycle (6):** agent.spawned, agent.idle, agent.completed, agent.failed, agent.paused, agent.resumed
- **Reasoning (7):** turn.started, turn.thinking, turn.thought, turn.acting, turn.observed, turn.completed, turn.failed
- **Collaboration (4):** handoff.initiated, handoff.accepted, handoff.rejected, handoff.completed
- **Memory (3):** memory.write, memory.read, checkpoint.created
- **Intervention (4):** breakpoint.set, breakpoint.hit, breakpoint.inject, breakpoint.release
- **Cost (2):** cost.tokens, cost.api_call
- **Memory Extensions (6):** memory.tier_migration, memory.conflict, memory.prune, memory.reconsolidate, memory.structure_switch, memory.coherence_violation

## Cost Tracking

Built-in pricing for common models (Claude, GPT-4o, Gemini, Llama). Unknown models default to $0.

```python
from sutures_langgraph import CostCalculator, ModelPricing

calc = CostCalculator(custom_pricing={
    "my-fine-tuned-model": ModelPricing(input_per_million=5.0, output_per_million=15.0),
})
result = calc.calculate("gpt-4o", input_tokens=1000, output_tokens=500)
print(f"Cost: ${result.cost_usd:.6f}, Cumulative: ${result.cumulative_cost_usd:.6f}")
```

## Architecture

```
Your LangGraph App
    |
    v
SuturesLangGraphAdapter
    |-- SuturesTracer (LangChain callback handler)
    |-- BreakpointEngine (local condition evaluator, <10ms)
    |-- CostCalculator (built-in model pricing)
    |-- SuturesWSClient (async WebSocket to collector)
    |
    v
Sutures Collector (ws://localhost:9470)
    |
    v
Sutures Dashboard (http://localhost:9472)
```

## Requirements

- Python 3.10+
- langgraph >= 1.0
- langchain-core >= 0.3
- websockets >= 12.0

## License

Apache 2.0
