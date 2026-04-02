# Breakpoint Conditions

Sutures supports 13 breakpoint condition types. Each condition is evaluated against every incoming event to determine if an agent should be paused.

## Breakpoint Configuration Schema

```typescript
interface BreakpointConfig {
  /** Auto-generated UUID if omitted. */
  breakpoint_id?: string;

  /** One of 13 condition types. */
  condition: BreakpointConditionType;

  /** Target agent. Omit to match all agents. */
  agent_id?: string;

  /** Target swarm. Omit to match all swarms. */
  swarm_id?: string;

  /** Condition-specific threshold or matcher value. */
  value?: unknown;

  /** If true, breakpoint is removed after first hit. */
  once?: boolean;
}
```

## Condition Reference

### 1. `always`

Triggers on every turn of the target agent.

| Field | Value |
|---|---|
| `value` | Not used |
| Matching events | `turn.started`, `turn.completed` |
| Use case | Step-through debugging |

---

### 2. `on_turn`

Triggers on a specific turn number.

| Field | Value |
|---|---|
| `value` | `number` — Turn number to break on |
| Matching events | `turn.started` where `data.turn_number === value` |
| Use case | Break before a known problematic turn |

---

### 3. `on_tool`

Triggers when a specific tool is called.

| Field | Value |
|---|---|
| `value` | `string` — Tool name to match |
| Matching events | `turn.acting` where `data.tool_name === value` |
| Use case | Inspect state before a critical tool call |

---

### 4. `on_handoff`

Triggers when a handoff involves a specific agent.

| Field | Value |
|---|---|
| `value` | `string` — Agent ID (source or target) |
| Matching events | `handoff.initiated` where source or target matches |
| Use case | Inspect state at delegation boundaries |

---

### 5. `on_cost`

Triggers when cumulative cost exceeds a threshold.

| Field | Value |
|---|---|
| `value` | `number` — Cost threshold in USD |
| Matching events | `cost.tokens` where `data.cumulative_cost_usd > value` |
| Use case | Budget enforcement, cost spike investigation |

---

### 6. `on_error`

Triggers on any error event.

| Field | Value |
|---|---|
| `value` | Not used |
| Matching events | `agent.failed`, `turn.failed` |
| Use case | Automatic break on failure for investigation |

---

### 7. `on_score`

Triggers when a quality score drops below a threshold.

| Field | Value |
|---|---|
| `value` | `number` — Minimum acceptable score (0-1 or 0-10) |
| Matching events | Events with `data.score < value` |
| Use case | Quality gate enforcement |

---

### 8. `on_memory_tier_migration`

Triggers when memory moves between STM, MTM, and LTM tiers.

| Field | Value |
|---|---|
| `value` | Not used (or optional tier filter) |
| Matching events | `memory.tier_migration` |
| Use case | Inspect what is being promoted or evicted |

---

### 9. `on_conflict_detected`

Triggers when contradictory facts are found in memory.

| Field | Value |
|---|---|
| `value` | Not used |
| Matching events | `memory.conflict` |
| Use case | Debug shared memory corruption |

---

### 10. `on_context_pressure`

Triggers when context window usage exceeds a percentage threshold.

| Field | Value |
|---|---|
| `value` | `number` — Percentage threshold (e.g., `85`) |
| Matching events | Events where context usage exceeds threshold |
| Use case | Prevent context overflow and quality degradation |

---

### 11. `on_memory_structure_switch`

Triggers when an agent changes its memory organization strategy.

| Field | Value |
|---|---|
| `value` | Not used |
| Matching events | `memory.structure_switch` |
| Use case | Monitor FluxMem-style dynamic memory changes |

---

### 12. `on_memory_link_created`

Triggers when a new connection is created in the memory graph.

| Field | Value |
|---|---|
| `value` | Not used |
| Matching events | Memory graph update events |
| Use case | Track memory graph evolution |

---

### 13. `on_cache_coherence_violation`

Triggers when an agent holds stale shared memory.

| Field | Value |
|---|---|
| `value` | Not used |
| Matching events | `memory.coherence_violation` |
| Use case | Debug multi-agent shared state bugs |

## Examples

### Break on expensive tool calls
```json
{
  "condition": "on_tool",
  "agent_id": "writer",
  "value": "write_document",
  "once": true
}
```

### Break on budget overrun
```json
{
  "condition": "on_cost",
  "swarm_id": "research-swarm",
  "value": 1.00
}
```

### Break on context overflow
```json
{
  "condition": "on_context_pressure",
  "agent_id": "researcher",
  "value": 85
}
```

### Step-through debugging
```json
{
  "condition": "always",
  "agent_id": "critic"
}
```
