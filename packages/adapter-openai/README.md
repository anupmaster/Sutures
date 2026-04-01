# sutures-openai-agents

Sutures adapter for the [OpenAI Agents SDK](https://github.com/openai/openai-agents-python) -- breakpoints for AI agents.

## Installation

```bash
pip install sutures-openai-agents
```

## Quick Start

```python
from agents import Agent, Runner
from sutures_openai import SuturesOpenAIAdapter

adapter = SuturesOpenAIAdapter()

agent = Agent(name="Researcher", instructions="You research topics thoroughly.")

# Option 1: Wrap a single run (recommended)
result = await adapter.trace_run(Runner.run, agent, "What is quantum computing?")

# Option 2: Instrument then run separately
adapter.instrument_agent(agent)
result = await Runner.run(agent, "What is quantum computing?")

await adapter.close()
```

## Multi-Agent with Handoffs

```python
from agents import Agent, Runner

triage = Agent(name="Triage", instructions="Route to the right specialist.")
researcher = Agent(name="Researcher", instructions="Research topics.")
writer = Agent(name="Writer", instructions="Write clear summaries.")

triage.handoffs = [researcher, writer]

adapter = SuturesOpenAIAdapter(swarm_id="my-swarm")
result = await adapter.trace_run(Runner.run, triage, "Write about AI safety")
await adapter.close()
```

## Manual Events

```python
# Emit handoff events explicitly
adapter.emit_handoff("Triage", "Researcher", reason="needs research")

# Emit cost events
adapter.emit_cost("Researcher", "gpt-4o", input_tokens=1500, output_tokens=800, cost_usd=0.039)
```

## Configuration

```python
adapter = SuturesOpenAIAdapter(
    collector_url="ws://localhost:9470/v1/events",  # Sutures collector
    swarm_id="my-swarm-id",                         # Optional, auto-generated if omitted
)
```

## Event Mapping

| OpenAI Agents SDK         | Sutures Event              |
|---------------------------|----------------------------|
| Agent created             | `agent.spawned`            |
| Runner.run() start        | `turn.started`             |
| Tool call                 | `turn.acting`              |
| Tool result               | `turn.observed`            |
| Handoff                   | `handoff.initiated/accepted` |
| Run complete              | `turn.completed` + `agent.completed` |
| Run error                 | `turn.failed` + `agent.failed` |
| Token usage               | `cost.tokens`              |

## Requirements

- Python >= 3.10
- OpenAI Agents SDK (`openai-agents >= 0.1`)
- Sutures collector running on `ws://localhost:9470`

## License

Apache-2.0
