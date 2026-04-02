# Event Protocol

The AgentEvent Protocol v1.0 defines 32 event types that cover the complete lifecycle of multi-agent systems. Every adapter emits events conforming to this protocol, and the collector validates them with Zod schemas.

## Base Event Schema

Every event shares this structure:

```typescript
{
  event_id: string,          // Unique ID (UUIDv7 recommended)
  swarm_id: string,          // Swarm/session identifier
  agent_id: string,          // Agent that produced this event
  parent_agent_id?: string,  // Parent agent (if delegated)
  timestamp: string,         // ISO 8601
  duration_ms?: number,      // Duration for completed events
  event_type: string,        // One of 32 event types
  severity: string,          // debug | info | warn | error | critical
  data: Record<string, unknown>, // Event-specific payload
  protocol_version: "1.0.0"
}
```

## Lifecycle Events (6)

Track agent state transitions from spawn to completion.

| Event | Description |
|---|---|
| `agent.spawned` | Agent created and ready. `data`: `{ name, role, model, tools[] }` |
| `agent.idle` | Agent waiting for input or between turns |
| `agent.completed` | Agent finished successfully. `data`: `{ total_cost_usd }` |
| `agent.failed` | Agent encountered a fatal error. `data`: `{ error, stack_trace }` |
| `agent.paused` | Agent paused by breakpoint or manual control |
| `agent.resumed` | Agent resumed after pause |

## Reasoning Events (7)

Trace the think-act-observe loop within each agent turn.

| Event | Description |
|---|---|
| `turn.started` | New reasoning turn begins. `data`: `{ turn_number, input, input_tokens }` |
| `turn.thinking` | Model is generating reasoning. `data`: `{ content, model, prompt_tokens }` |
| `turn.thought` | Reasoning complete, decision made |
| `turn.acting` | Agent invoking a tool. `data`: `{ tool_name, tool_input_summary }` |
| `turn.observed` | Tool returned result. `data`: `{ tool_name, tool_output_summary, output_tokens }` |
| `turn.completed` | Turn finished. `data`: `{ turn_number, output_summary, duration_ms }` |
| `turn.failed` | Turn failed with error. `data`: `{ error, turn_number }` |

## Collaboration Events (4)

Track work delegation between agents.

| Event | Description |
|---|---|
| `handoff.initiated` | Agent requesting handoff. `data`: `{ source_agent_id, target_agent_id, reason }` |
| `handoff.accepted` | Target agent accepted handoff |
| `handoff.rejected` | Target agent rejected handoff. `data`: `{ reason }` |
| `handoff.completed` | Handoff workflow finished |

## Memory Events (3 + 6 Extended)

### Core Memory Events

| Event | Description |
|---|---|
| `memory.write` | Data written to memory. `data`: `{ key, value, tier, shared, reader_agent_ids[] }` |
| `memory.read` | Data read from memory. `data`: `{ key }` |
| `checkpoint.created` | State checkpoint saved. `data`: `{ checkpoint_id, thread_id, state }` |

### Extended Memory Events (Research-Backed)

These 6 events are based on findings from 9 academic papers on agent memory architectures (MemoryOS, G-Memory, HiMem, H-MEM, FluxMem, Focus Agent, and Multi-Agent Architecture papers).

| Event | Source Paper | Description |
|---|---|---|
| `memory.tier_migration` | MemoryOS | Memory moved between STM/MTM/LTM. `data`: `{ key, from_tier, to_tier, reason }` |
| `memory.conflict` | HiMem | Contradictory facts detected. `data`: `{ keys[], conflict_description }` |
| `memory.prune` | Focus Agent | Memory pruned to free context. `data`: `{ keys[], reason, tokens_freed }` |
| `memory.reconsolidate` | H-MEM | Memory reconsolidated with new evidence. `data`: `{ key, old_value, new_value }` |
| `memory.structure_switch` | FluxMem | Agent changed memory organization. `data`: `{ from_structure, to_structure, confidence }` |
| `memory.coherence_violation` | Multi-Agent Arch | Agent has stale shared memory. `data`: `{ key, stale_agent_id, current_version }` |

## Intervention Events (4)

Control breakpoint lifecycle.

| Event | Description |
|---|---|
| `breakpoint.set` | Breakpoint configured. `data`: `{ breakpoint_id, condition, value }` |
| `breakpoint.hit` | Breakpoint triggered, agent paused. `data`: `{ breakpoint_id, agent_id }` |
| `breakpoint.inject` | State/messages injected into paused agent. `data`: `{ agent_id, state, messages, mode }` |
| `breakpoint.release` | Breakpoint released. `data`: `{ breakpoint_id }` |

## Cost Events (2)

Track token usage and API costs.

| Event | Description |
|---|---|
| `cost.tokens` | Token usage for a model call. `data`: `{ model, input_tokens, output_tokens, cost_usd, cumulative_cost_usd }` |
| `cost.api_call` | External API call cost. `data`: `{ service, endpoint, cost_usd }` |

## Severity Levels

| Level | Usage |
|---|---|
| `debug` | Thinking content, internal traces |
| `info` | Normal lifecycle events |
| `warn` | Anomalies, high context pressure |
| `error` | Agent failures, tool errors |
| `critical` | Swarm-level failures |
