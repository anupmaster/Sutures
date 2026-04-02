# Anomaly Detection

Sutures includes a built-in Anomaly Engine that automatically detects common failure patterns in multi-agent systems and alerts you before they cascade.

## 4 Anomaly Types

### 1. Infinite Loop (`infinite_loop`)

**Detection**: An agent exceeds a threshold number of turns without completing, or repeats the same tool call pattern multiple times.

**Severity**: `error`

**Example alert**:
```json
{
  "type": "infinite_loop",
  "agent_id": "researcher",
  "swarm_id": "swarm-001",
  "message": "Agent 'researcher' has completed 15 turns without finishing — possible infinite loop",
  "severity": "error",
  "details": {
    "turn_count": 15,
    "repeated_tool": "web_search",
    "repeat_count": 8
  }
}
```

**Common cause**: Agent keeps calling the same tool with slight variations, unable to find a satisfactory result.

### 2. Cost Spike (`cost_spike`)

**Detection**: A single agent's cost exceeds a configurable threshold, or the rate of cost accumulation increases dramatically.

**Severity**: `warn`

**Example alert**:
```json
{
  "type": "cost_spike",
  "agent_id": "writer",
  "swarm_id": "swarm-001",
  "message": "Agent 'writer' cost spike: $0.278 in last turn (cumulative: $0.304)",
  "severity": "warn",
  "details": {
    "turn_cost_usd": 0.278,
    "cumulative_cost_usd": 0.304,
    "model": "claude-opus-4-20250514"
  }
}
```

**Common cause**: Using expensive models (Opus) for high-output tasks, or context window bloat inflating input token counts.

### 3. Context Bloat (`context_bloat`)

**Detection**: An agent's context window usage grows beyond expected bounds, especially when token counts increase faster than useful output is produced.

**Severity**: `warn`

**Example alert**:
```json
{
  "type": "context_bloat",
  "agent_id": "researcher",
  "swarm_id": "swarm-001",
  "message": "Agent 'researcher' context growing rapidly: 85% capacity after 3 turns",
  "severity": "warn",
  "details": {
    "context_usage_percent": 85,
    "input_tokens": 12500,
    "turn_count": 3
  }
}
```

**Common cause**: Tool outputs being appended without summarization, verbose system prompts, or unnecessary conversation history.

### 4. Handoff Cycle (`handoff_cycle`)

**Detection**: Agents hand off work in a cycle (A -> B -> C -> A) without making progress toward completion.

**Severity**: `error`

**Example alert**:
```json
{
  "type": "handoff_cycle",
  "agent_id": "critic",
  "swarm_id": "swarm-001",
  "message": "Handoff cycle detected: researcher -> critic -> researcher (2 cycles)",
  "severity": "error",
  "details": {
    "cycle": ["researcher", "critic", "researcher"],
    "cycle_count": 2
  }
}
```

**Common cause**: A critic keeps rejecting work and sending it back, or routing logic fails to converge.

## Anomaly Events in the Dashboard

When an anomaly is detected, the dashboard receives an `anomaly` message:

```json
{
  "type": "anomaly",
  "payload": {
    "type": "infinite_loop",
    "agent_id": "researcher",
    "swarm_id": "swarm-001",
    "message": "...",
    "severity": "error",
    "detected_at": "2026-04-01T10:30:00.000Z",
    "details": { ... }
  }
}
```

Anomalies appear as notifications in the dashboard and are highlighted on the affected agent's node in the topology canvas.

## Combining Anomalies with Breakpoints

Set breakpoints that trigger on anomaly-related conditions:

- `on_cost` at $0.50 to catch cost spikes before they get worse
- `on_context_pressure` at 85% to catch context bloat
- `on_error` to catch the failures that loops eventually produce

This creates a safety net: the anomaly engine warns you, and breakpoints pause execution so you can intervene.
