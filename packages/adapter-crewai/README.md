# sutures-crewai

Sutures adapter for [CrewAI](https://github.com/crewAIInc/crewAI). Instrument your CrewAI crews with live debugging, conditional breakpoints, and real-time event streaming.

## Quick Start (3 lines)

```python
from sutures_crewai import SuturesCrewAIAdapter

adapter = SuturesCrewAIAdapter(collector_url="ws://localhost:9470")
adapter.instrument_crew(crew)  # wraps all agents with Sutures tracing
crew.kickoff()
```

## Features

- Automatic event emission for all 32 Sutures event types
- Maps CrewAI task lifecycle → Sutures agent events
- Tool call tracing with input/output capture
- Delegation tracking as handoff events
- Cost tracking per agent/model
- Conditional breakpoints (13 condition types)

## Requirements

- Python 3.10+
- CrewAI >= 0.80
- Sutures collector running on port 9470
