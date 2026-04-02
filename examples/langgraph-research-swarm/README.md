# Sutures + LangGraph -- Research Swarm Example

A 3-agent LangGraph graph (Researcher -> Critic -> Writer) instrumented with Sutures for live debugging.

## Setup

```bash
# 1. Start the Sutures collector + dashboard
npx sutures

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Set your API key
export OPENAI_API_KEY=sk-...

# Or create a .env file:
echo "OPENAI_API_KEY=sk-..." > .env

# 4. Run the example
python main.py

# 5. Open the dashboard
open http://localhost:9472
```

## What You'll See

- **Topology view**: Three nodes (Researcher -> Critic -> Writer) auto-laid out
- **Agent Inspector**: Click any node to see its state, messages, and context
- **Timeline**: Watch each agent execute in sequence with real LLM calls
- **Cost panel**: Token usage and estimated cost per agent

## How It Works

The tracer is added in **3 lines**:

```python
from sutures_langgraph import SuturesTracer

tracer = SuturesTracer(endpoint="ws://localhost:9470/v1/events", swarm_name="Research Swarm")
result = await graph.ainvoke(input, config={"callbacks": [tracer]})
```

The `SuturesTracer` hooks into LangGraph's callback system to automatically capture node execution, tool calls, token usage, and state transitions -- no manual event emission needed.

## Configuration

- Change `MODEL` to `"gpt-4o"` for better quality (more expensive)
- Change `TOPIC` to research any subject
- Add tools to agents for richer traces (tool calls show as `turn.acting`/`turn.observed` events)
