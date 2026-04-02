# Sutures + CrewAI — Research Team Example

A 3-agent CrewAI crew (Researcher, Analyst, Writer) instrumented with Sutures for live debugging.

## Setup

```bash
# 1. Start the Sutures collector + dashboard
npx sutures

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Set your API key
export OPENAI_API_KEY=sk-...

# 4. Run the example
python main.py

# 5. Open the dashboard
open http://localhost:9472
```

## What You'll See

- **Topology view**: Three agent nodes (Researcher -> Analyst -> Writer) with handoff edges
- **Agent Inspector**: Click any agent to see its role, model, tools, and turn history
- **Cost panel**: Token usage and cost per agent
- **Timeline**: Sequential task execution with tool calls

## How It Works

The adapter is added in **2 lines**:

```python
adapter = SuturesCrewAIAdapter()
adapter.instrument_crew(crew)
```

After `instrument_crew()`, every agent spawn, task execution, and tool call is automatically streamed to the Sutures collector via WebSocket.
