# Event Protocol v1.0 — Full Specification

The AgentEvent Protocol v1.0 is the wire format for all communication between adapters and the Sutures collector. Every event is validated against Zod schemas on ingestion.

## Protocol Version

All events must include `protocol_version: "1.0.0"`.

## Base Schema

```typescript
interface AgentEvent {
  /** Unique event ID. UUIDv7 recommended for time-ordering. */
  event_id: string;

  /** Swarm/session identifier. Groups related agents. */
  swarm_id: string;

  /** Agent that produced this event. */
  agent_id: string;

  /** Parent agent ID, if this agent was spawned by delegation. */
  parent_agent_id?: string;

  /** ISO 8601 timestamp. */
  timestamp: string;

  /** Duration in milliseconds (for completed/observed events). */
  duration_ms?: number;

  /** One of 32 event types. */
  event_type: AgentEventType;

  /** Severity level. */
  severity: "debug" | "info" | "warn" | "error" | "critical";

  /** Event-specific payload. Structure varies by event_type. */
  data: Record<string, unknown>;

  /** Protocol version. Must be "1.0.0". */
  protocol_version: "1.0.0";
}
```

## All 32 Event Types

### Lifecycle Events (6)

#### `agent.spawned`
Agent has been created and is ready to receive work.

| Field | Type | Description |
|---|---|---|
| `data.name` | `string` | Display name |
| `data.role` | `string` | Agent role (e.g., "research", "writing") |
| `data.model` | `string` | LLM model used |
| `data.tools` | `string[]` | Available tools |

#### `agent.idle`
Agent is waiting for input or between turns. No specific data fields.

#### `agent.completed`
Agent has finished all assigned work successfully.

| Field | Type | Description |
|---|---|---|
| `data.total_cost_usd` | `number` | Total cost for this agent's run |

#### `agent.failed`
Agent encountered a fatal error and cannot continue.

| Field | Type | Description |
|---|---|---|
| `data.error` | `string` | Error message |
| `data.stack_trace` | `string` | Stack trace if available |

#### `agent.paused`
Agent is paused, either by a breakpoint hit or manual pause.

| Field | Type | Description |
|---|---|---|
| `data.reason` | `string` | Why the agent was paused (breakpoint ID or "pause_all") |

#### `agent.resumed`
Agent has been resumed after a pause. No specific data fields.

---

### Reasoning Events (7)

#### `turn.started`
A new reasoning turn has begun.

| Field | Type | Description |
|---|---|---|
| `data.turn_number` | `number` | Sequential turn index |
| `data.input` | `string` | Input prompt or task for this turn |
| `data.input_tokens` | `number` | Token count of the input |

#### `turn.thinking`
The model is generating reasoning (chain-of-thought). Typically `severity: "debug"`.

| Field | Type | Description |
|---|---|---|
| `data.turn_number` | `number` | Turn index |
| `data.model` | `string` | Model being used |
| `data.content` | `string` | Thinking/reasoning content |
| `data.prompt_tokens` | `number` | Tokens in the prompt |

#### `turn.thought`
Reasoning is complete and a decision has been made. Marks the transition from thinking to acting.

#### `turn.acting`
Agent is invoking a tool.

| Field | Type | Description |
|---|---|---|
| `data.turn_number` | `number` | Turn index |
| `data.tool_name` | `string` | Name of the tool being called |
| `data.tool_input_summary` | `string` | Summary of tool input |

#### `turn.observed`
Tool has returned a result.

| Field | Type | Description |
|---|---|---|
| `data.turn_number` | `number` | Turn index |
| `data.tool_name` | `string` | Tool that was called |
| `data.tool_output_summary` | `string` | Summary of tool output |
| `data.output_tokens` | `number` | Tokens in the output |

#### `turn.completed`
Turn has finished successfully.

| Field | Type | Description |
|---|---|---|
| `data.turn_number` | `number` | Turn index |
| `data.output_summary` | `string` | Summary of the turn's output |
| `data.duration_ms` | `number` | Turn duration in milliseconds |

#### `turn.failed`
Turn encountered an error.

| Field | Type | Description |
|---|---|---|
| `data.turn_number` | `number` | Turn index |
| `data.error` | `string` | Error message |

---

### Collaboration Events (4)

#### `handoff.initiated`
An agent is requesting to hand off work to another agent.

| Field | Type | Description |
|---|---|---|
| `data.source_agent_id` | `string` | Agent initiating the handoff |
| `data.target_agent_id` | `string` | Target agent |
| `data.reason` | `string` | Why the handoff is happening |

#### `handoff.accepted`
The target agent has accepted the handoff.

| Field | Type | Description |
|---|---|---|
| `data.source_agent_id` | `string` | Source agent |
| `data.target_agent_id` | `string` | Agent that accepted |

#### `handoff.rejected`
The target agent has rejected the handoff.

| Field | Type | Description |
|---|---|---|
| `data.source_agent_id` | `string` | Source agent |
| `data.target_agent_id` | `string` | Agent that rejected |
| `data.reason` | `string` | Rejection reason |

#### `handoff.completed`
The handoff workflow has completed (target finished the delegated work).

---

### Memory Events (3 Core + 6 Extended)

#### `memory.write`
Data written to an agent's memory.

| Field | Type | Description |
|---|---|---|
| `data.key` | `string` | Memory key |
| `data.value` | `string` | Value stored |
| `data.tier` | `string` | Target tier: `"stm"`, `"mtm"`, or `"ltm"` |
| `data.shared` | `boolean` | Whether this key is shared with other agents |
| `data.reader_agent_ids` | `string[]` | Agents that can read this key |

#### `memory.read`
Data read from memory.

| Field | Type | Description |
|---|---|---|
| `data.key` | `string` | Memory key read |

#### `checkpoint.created`
A state checkpoint has been saved.

| Field | Type | Description |
|---|---|---|
| `data.checkpoint_id` | `string` | Checkpoint identifier |
| `data.thread_id` | `string` | Execution thread |
| `data.state` | `unknown` | Full agent state |
| `data.memory_hierarchy` | `unknown` | STM/MTM/LTM contents |
| `data.parent_checkpoint_id` | `string` | Parent checkpoint (for forks) |

#### `memory.tier_migration`
Memory moved between tiers.

| Field | Type | Description |
|---|---|---|
| `data.key` | `string` | Memory key |
| `data.from_tier` | `string` | Source tier |
| `data.to_tier` | `string` | Destination tier |
| `data.reason` | `string` | Migration reason |

#### `memory.conflict`
Contradictory facts detected in memory.

| Field | Type | Description |
|---|---|---|
| `data.keys` | `string[]` | Conflicting keys |
| `data.conflict_description` | `string` | Description of the conflict |

#### `memory.prune`
Memory pruned to free context space.

| Field | Type | Description |
|---|---|---|
| `data.keys` | `string[]` | Pruned keys |
| `data.reason` | `string` | Why pruning occurred |
| `data.tokens_freed` | `number` | Tokens freed |

#### `memory.reconsolidate`
Memory reconsolidated with new evidence.

| Field | Type | Description |
|---|---|---|
| `data.key` | `string` | Memory key |
| `data.old_value` | `string` | Previous value |
| `data.new_value` | `string` | Updated value |

#### `memory.structure_switch`
Agent changed memory organization strategy.

| Field | Type | Description |
|---|---|---|
| `data.from_structure` | `string` | Previous structure (linear/graph/hybrid) |
| `data.to_structure` | `string` | New structure |
| `data.confidence` | `number` | Confidence in the switch (0-1) |

#### `memory.coherence_violation`
Agent has stale shared memory.

| Field | Type | Description |
|---|---|---|
| `data.key` | `string` | Stale key |
| `data.stale_agent_id` | `string` | Agent with stale data |
| `data.current_version` | `number` | Current version number |

---

### Intervention Events (4)

#### `breakpoint.set`
A breakpoint has been configured.

| Field | Type | Description |
|---|---|---|
| `data.breakpoint_id` | `string` | Breakpoint identifier |
| `data.condition` | `string` | Condition type |
| `data.value` | `unknown` | Condition value/threshold |

#### `breakpoint.hit`
A breakpoint condition was met, agent is paused.

| Field | Type | Description |
|---|---|---|
| `data.breakpoint_id` | `string` | Breakpoint that fired |
| `data.agent_id` | `string` | Agent that was paused |

#### `breakpoint.inject`
State or messages injected into a paused agent.

| Field | Type | Description |
|---|---|---|
| `data.agent_id` | `string` | Target agent |
| `data.state` | `Record` | Injected state |
| `data.messages` | `Array` | Injected messages |
| `data.mode` | `string` | `"append"` or `"replace"` |

#### `breakpoint.release`
A breakpoint has been released.

| Field | Type | Description |
|---|---|---|
| `data.breakpoint_id` | `string` | Released breakpoint |

---

### Cost Events (2)

#### `cost.tokens`
Token usage for a model call.

| Field | Type | Description |
|---|---|---|
| `data.model` | `string` | Model name |
| `data.input_tokens` | `number` | Input token count |
| `data.output_tokens` | `number` | Output token count |
| `data.cost_usd` | `number` | Cost for this call |
| `data.cumulative_cost_usd` | `number` | Running total for this agent |

#### `cost.api_call`
External API call cost (non-LLM).

| Field | Type | Description |
|---|---|---|
| `data.service` | `string` | Service name |
| `data.endpoint` | `string` | API endpoint |
| `data.cost_usd` | `number` | Cost in USD |
