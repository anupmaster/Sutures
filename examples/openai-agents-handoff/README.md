# Sutures + OpenAI Agents SDK — Handoff Example

A triage agent that routes questions to a Researcher or Coder, instrumented with Sutures.

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

- **Topology view**: Triage agent with edges to Researcher and Coder
- **Handoff events**: Watch the triage agent route to the right specialist
- **Tool calls**: search_papers (Researcher) and write_code (Coder)
- **Cost tracking**: Token usage per agent and per run

## How It Works

The adapter is added in **3 lines**:

```python
adapter = SuturesOpenAIAdapter()
await adapter.connect()
adapter.instrument_agent(triage_agent)  # recursively instruments handoff targets
```

Use `trace_run()` to wrap a `Runner.run()` call with full tracing:

```python
result = await adapter.trace_run(Runner.run, triage_agent, "your question")
```
