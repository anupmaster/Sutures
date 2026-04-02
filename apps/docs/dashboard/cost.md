# Cost Tracking

The Cost Tracking panel provides real-time visibility into token usage and API costs across your agent swarm. Access it via the "Cost" tab in the right sidebar.

## Summary View

The top of the panel shows aggregate metrics:

- **Total cost** in USD for the current run
- **Total tokens** (input + output) across all agents
- **Cost per agent** breakdown
- **Cost trend** — rate of spending over time

## Per-Agent Breakdown

A table showing cost details for each agent:

| Agent | Model | Input Tokens | Output Tokens | Cost (USD) | Turns |
|---|---|---|---|---|---|
| Researcher | claude-sonnet-4-20250514 | 750 | 1,050 | $0.018 | 3 |
| Critic | claude-sonnet-4-20250514 | 1,200 | 450 | $0.008 | 1 |
| Writer | claude-opus-4-20250514 | 2,500 | 3,200 | $0.278 | 1 |

## Cost by Model

A pie or bar chart showing cost distribution across models. Useful for identifying when expensive models (e.g., Opus) are being used for tasks that could use cheaper models (e.g., Sonnet or Haiku).

## Cost Over Time

A line chart showing cumulative cost over the run duration, with per-agent breakdown. Spikes are clearly visible and often correlate with:

- Using expensive models for high-output tasks
- Context window bloat inflating input token costs
- Redundant tool calls

## Cost Events

The panel is fed by two event types:

### `cost.tokens`
```json
{
  "model": "claude-sonnet-4-20250514",
  "input_tokens": 200,
  "output_tokens": 300,
  "cost_usd": 0.003,
  "cumulative_cost_usd": 0.018
}
```

### `cost.api_call`
```json
{
  "service": "web_search",
  "endpoint": "/v1/search",
  "cost_usd": 0.001
}
```

## Cost Anomalies

The anomaly engine detects `cost_spike` anomalies when:

- A single turn costs more than a configurable threshold
- The rate of cost accumulation increases dramatically
- An agent's cumulative cost exceeds budget

Cost anomalies appear as alerts in the Diagnostics panel and are highlighted in the cost chart.

## Budget Controls

Set cost-based breakpoints to prevent runaway spending:

```json
{
  "condition": "on_cost",
  "agent_id": "writer",
  "value": 0.50
}
```

When cumulative cost for the agent exceeds the threshold, a breakpoint fires and the agent pauses. You can then inspect the agent, adjust parameters, or terminate the run.

## MCP Integration

Use the `get_cost_breakdown` MCP tool to query cost data from Claude Code or Cursor:

> "How much has this run cost and where is the money going?"

The tool returns the same data shown in the dashboard panel, formatted for AI consumption.
