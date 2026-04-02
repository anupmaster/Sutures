# OpenAI Agents SDK Adapter

The OpenAI Agents SDK adapter connects OpenAI's agent framework to Sutures via the SDK's hook system.

::: info Status
The OpenAI Agents SDK adapter is planned for P3 (Month 3+). The interface below shows the target API.
:::

## Integration (3 Lines)

```python
from sutures import SuturesAdapter

tracer = SuturesAdapter(swarm_id="my-agents")
runner = Runner(agent=agent, hooks=[tracer])
```

## Full Example

```python
from openai_agents import Agent, Runner, Tool
from sutures import SuturesAdapter

researcher = Agent(
    name="Researcher",
    model="gpt-4o",
    tools=[web_search, arxiv_search],
    instructions="Research multi-agent memory architectures.",
)

writer = Agent(
    name="Writer",
    model="gpt-4o",
    instructions="Write a report based on research findings.",
)

# Attach Sutures
tracer = SuturesAdapter(swarm_id="research-agents")
runner = Runner(agent=researcher, hooks=[tracer])

result = await runner.run("Research and write about agent memory")
```

## Event Mapping

| OpenAI Agents SDK Hook | Sutures Event |
|---|---|
| `on_agent_start` | `agent.spawned` |
| `on_agent_end` | `agent.completed` |
| `on_tool_start` | `turn.acting` |
| `on_tool_end` | `turn.observed` |
| `on_handoff` | `handoff.initiated` + `handoff.accepted` |
| `on_error` | `agent.failed` / `turn.failed` |

## Configuration

```python
tracer = SuturesAdapter(
    swarm_id="my-agents",
    ws_url="ws://localhost:9470/v1/events",
    auto_checkpoint=True,
    emit_thinking=True,
)
```
