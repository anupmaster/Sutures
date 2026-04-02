# CrewAI Adapter

The CrewAI adapter connects CrewAI crews to Sutures via CrewAI's callback system.

::: info Status
The CrewAI adapter is planned for P2 (Week 6-8). The interface below shows the target API.
:::

## Integration (3 Lines)

```python
from sutures import SuturesAdapter

tracer = SuturesAdapter(swarm_id="my-crew")
crew = Crew(agents=[...], tasks=[...], callbacks=[tracer])
```

## Full Example

```python
from crewai import Agent, Task, Crew
from sutures import SuturesAdapter

researcher = Agent(
    role="Researcher",
    goal="Find papers on agent memory",
    backstory="You are a research specialist.",
    tools=[search_tool],
)

writer = Agent(
    role="Writer",
    goal="Write a comprehensive report",
    backstory="You are a technical writer.",
)

research_task = Task(
    description="Research multi-agent memory architectures",
    agent=researcher,
)

write_task = Task(
    description="Write a report based on research findings",
    agent=writer,
)

# Attach Sutures
tracer = SuturesAdapter(swarm_id="research-crew")
crew = Crew(
    agents=[researcher, writer],
    tasks=[research_task, write_task],
    callbacks=[tracer],
)

result = crew.kickoff()
```

## Event Mapping

| CrewAI Callback | Sutures Event |
|---|---|
| `on_agent_start` | `agent.spawned` |
| `on_agent_end` | `agent.completed` |
| `on_task_start` | `turn.started` |
| `on_task_end` | `turn.completed` |
| `on_tool_start` | `turn.acting` |
| `on_tool_end` | `turn.observed` |
| Agent delegation | `handoff.initiated` + `handoff.accepted` |

## Breakpoints

CrewAI breakpoints work through the callback system. When a breakpoint condition is met, the adapter pauses the crew's execution loop and waits for a release signal from the collector.

## Configuration

```python
tracer = SuturesAdapter(
    swarm_id="my-crew",
    ws_url="ws://localhost:9470/v1/events",
    auto_checkpoint=True,
    emit_thinking=True,
)
```
