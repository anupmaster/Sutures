# AgentEvent Protocol Specification v1.0

> **Sutures** — Breakpoints for AI Agents
> Open standard for capturing, transmitting, and replaying multi-agent system events.

---

## 1. Core Entities

| Entity | OTEL Mapping | Description |
|---|---|---|
| Swarm | Trace | Top-level execution context |
| Agent | Resource | Individual agent in the swarm |
| Turn | Span | Single agent cycle: think → act → observe |
| Handoff | Link | State transfer between agents |
| Checkpoint | Event | Serialized state for replay/intervention |

## 2. Agent Lifecycle States

SPAWNED → IDLE → THINKING → ACTING → OBSERVING → IDLE → ... → COMPLETED | FAILED | PAUSED

## 3. All 32 Event Types

### Lifecycle (6)
agent.spawned, agent.idle, agent.completed, agent.failed, agent.paused, agent.resumed

### Reasoning (7)
turn.started, turn.thinking, turn.thought, turn.acting, turn.observed, turn.completed, turn.failed

### Collaboration (4)
handoff.initiated, handoff.accepted, handoff.rejected, handoff.completed

### Memory & State (3)
memory.write, memory.read, checkpoint.created

### Intervention (4)
breakpoint.set, breakpoint.hit, breakpoint.inject, breakpoint.release

### Cost (2)
cost.tokens, cost.api_call

### Memory Extensions (6 — NEW)
memory.tier_migration, memory.conflict, memory.prune
memory.reconsolidate, memory.structure_switch, memory.coherence_violation

## 4. Base Event Schema

```typescript
interface AgentEvent<T> {
  event_id: string;          // UUIDv7
  swarm_id: string;          // Top-level trace ID
  agent_id: string;          // Agent identifier
  parent_agent_id?: string;  // Supervisor
  timestamp: string;         // ISO 8601 microsecond
  duration_ms?: number;
  event_type: AgentEventType;
  severity: 'debug' | 'info' | 'warn' | 'error' | 'critical';
  data: T;
  protocol_version: '1.0.0';
}
```

## 5. Transport

WebSocket (primary): ws://localhost:9470/v1/events
OTEL gRPC: localhost:4317 | OTEL HTTP: localhost:4318
Dashboard UI: localhost:9472

## 6. OTEL Semantic Convention Mapping

| AEP Field | OTEL Attribute |
|---|---|
| swarm_id | trace_id |
| agent_id | resource.agent.id |
| event_type | span.name (prefixed sutures.) |
| tokens.* | gen_ai.usage.* |
| cost_usd | sutures.cost.usd |

## 7. Privacy & Security

- System prompts: SHA-256 hash only (never transmitted)
- Tool outputs: ≤500 char summaries (full capture opt-in)
- Message content: via checkpoints only (server-side)
- PII detection hook: adapter registers sanitize() function
- WebSocket: API key authentication required

---

*Protocol v1.0.0 | Apache 2.0 | Anup Karanjkar*
