import { v7 as uuidv7 } from 'uuid';
import type {
  AgentEvent,
  AgentEventType,
  OtelSpanData,
  OtelSpanEvent,
  CostTokensData,
  CostApiCallData,
  TurnStartedData,
  TurnThinkingData,
  TurnObservedData,
  TurnCompletedData,
  TurnActingData,
  AgentSpawnedData,
  AgentCompletedData,
  AgentFailedData,
  HandoffInitiatedData,
  HandoffCompletedData,
  HandoffRejectedData,
  MemoryWriteData,
  MemoryReadData,
  MemoryTierMigrationData,
  MemoryConflictData,
  MemoryPruneData,
  MemoryCoherenceViolationData,
  MemoryStructureSwitchData,
  BreakpointHitData,
  BreakpointSetData,
  CheckpointCreatedData,
} from './types.js';

// ----------------------------------------------------------------------------
// Severity → OTEL status mapping
// ----------------------------------------------------------------------------

function severityToStatus(severity: string): 'ok' | 'error' | 'unset' {
  switch (severity) {
    case 'error':
    case 'critical':
      return 'error';
    case 'info':
    case 'debug':
      return 'ok';
    default:
      return 'unset';
  }
}

// ----------------------------------------------------------------------------
// Compute end time
// ----------------------------------------------------------------------------

function computeEndTime(timestamp: string, durationMs?: number): string | undefined {
  if (durationMs === undefined) return undefined;
  const start = new Date(timestamp).getTime();
  return new Date(start + durationMs).toISOString().replace('Z', '000Z');
}

// ----------------------------------------------------------------------------
// Attribute builders per event category
// ----------------------------------------------------------------------------

function baseAttributes(event: AgentEvent): Record<string, string | number | boolean> {
  const attrs: Record<string, string | number | boolean> = {
    'sutures.event_id': event.event_id,
    'sutures.event_type': event.event_type,
    'sutures.protocol_version': event.protocol_version,
    'sutures.severity': event.severity,
    'resource.agent.id': event.agent_id,
    'resource.swarm.id': event.swarm_id,
  };
  if (event.parent_agent_id) {
    attrs['resource.agent.parent_id'] = event.parent_agent_id;
  }
  if (event.duration_ms !== undefined) {
    attrs['sutures.duration_ms'] = event.duration_ms;
  }
  return attrs;
}

function addCostTokenAttributes(
  attrs: Record<string, string | number | boolean>,
  data: CostTokensData,
): void {
  attrs['gen_ai.usage.input_tokens'] = data.input_tokens;
  attrs['gen_ai.usage.output_tokens'] = data.output_tokens;
  attrs['gen_ai.usage.total_tokens'] = data.total_tokens;
  attrs['gen_ai.response.model'] = data.model;
  attrs['sutures.cost.usd'] = data.cost_usd;
  attrs['sutures.cost.cumulative_usd'] = data.cumulative_cost_usd;
}

function addCostApiCallAttributes(
  attrs: Record<string, string | number | boolean>,
  data: CostApiCallData,
): void {
  attrs['gen_ai.response.model'] = data.model;
  attrs['gen_ai.system'] = data.provider;
  attrs['http.status_code'] = data.status_code;
  attrs['sutures.cost.usd'] = data.cost_usd;
  attrs['sutures.api.latency_ms'] = data.latency_ms;
  attrs['sutures.api.endpoint'] = data.endpoint;
}

// ----------------------------------------------------------------------------
// Event-type-specific attribute enrichment
// ----------------------------------------------------------------------------

function enrichAttributes(
  attrs: Record<string, string | number | boolean>,
  event: AgentEvent,
): void {
  const data = event.data as Record<string, unknown>;

  switch (event.event_type as AgentEventType) {
    // --- Lifecycle ---
    case 'agent.spawned': {
      const d = data as unknown as AgentSpawnedData;
      attrs['sutures.agent.name'] = d.name;
      attrs['sutures.agent.role'] = d.role;
      attrs['gen_ai.response.model'] = d.model;
      attrs['sutures.agent.tools_count'] = d.tools.length;
      attrs['sutures.agent.system_prompt_hash'] = d.system_prompt_hash;
      break;
    }
    case 'agent.completed': {
      const d = data as unknown as AgentCompletedData;
      attrs['sutures.agent.total_turns'] = d.total_turns;
      attrs['gen_ai.usage.total_tokens'] = d.total_tokens;
      attrs['sutures.cost.usd'] = d.total_cost_usd;
      break;
    }
    case 'agent.failed': {
      const d = data as unknown as AgentFailedData;
      attrs['error.type'] = d.error_type;
      attrs['error.message'] = d.error_message;
      attrs['sutures.error.recoverable'] = d.recoverable;
      break;
    }

    // --- Reasoning ---
    case 'turn.started': {
      const d = data as unknown as TurnStartedData;
      attrs['sutures.turn.number'] = d.turn_number;
      attrs['gen_ai.usage.input_tokens'] = d.input_tokens;
      break;
    }
    case 'turn.thinking': {
      const d = data as unknown as TurnThinkingData;
      attrs['sutures.turn.number'] = d.turn_number;
      attrs['gen_ai.response.model'] = d.model;
      attrs['gen_ai.usage.input_tokens'] = d.prompt_tokens;
      break;
    }
    case 'turn.acting': {
      const d = data as unknown as TurnActingData;
      attrs['sutures.turn.number'] = d.turn_number;
      attrs['sutures.tool.name'] = d.tool_name;
      break;
    }
    case 'turn.observed': {
      const d = data as unknown as TurnObservedData;
      attrs['sutures.turn.number'] = d.turn_number;
      attrs['sutures.tool.name'] = d.tool_name;
      attrs['gen_ai.usage.output_tokens'] = d.output_tokens;
      break;
    }
    case 'turn.completed': {
      const d = data as unknown as TurnCompletedData;
      attrs['sutures.turn.number'] = d.turn_number;
      attrs['gen_ai.usage.output_tokens'] = d.output_tokens;
      attrs['gen_ai.usage.total_tokens'] = d.total_tokens;
      attrs['sutures.duration_ms'] = d.duration_ms;
      break;
    }

    // --- Collaboration ---
    case 'handoff.initiated': {
      const d = data as unknown as HandoffInitiatedData;
      attrs['sutures.handoff.source'] = d.source_agent_id;
      attrs['sutures.handoff.target'] = d.target_agent_id;
      break;
    }
    case 'handoff.rejected': {
      const d = data as unknown as HandoffRejectedData;
      attrs['sutures.handoff.source'] = d.source_agent_id;
      attrs['sutures.handoff.target'] = d.target_agent_id;
      attrs['sutures.handoff.rejection_reason'] = d.rejection_reason;
      break;
    }
    case 'handoff.completed': {
      const d = data as unknown as HandoffCompletedData;
      attrs['sutures.handoff.source'] = d.source_agent_id;
      attrs['sutures.handoff.target'] = d.target_agent_id;
      break;
    }

    // --- Memory ---
    case 'memory.write': {
      const d = data as unknown as MemoryWriteData;
      attrs['sutures.memory.key'] = d.key;
      attrs['sutures.memory.tier'] = d.tier;
      attrs['sutures.memory.token_count'] = d.token_count;
      break;
    }
    case 'memory.read': {
      const d = data as unknown as MemoryReadData;
      attrs['sutures.memory.key'] = d.key;
      attrs['sutures.memory.tier'] = d.tier;
      attrs['sutures.memory.hit'] = d.hit;
      break;
    }
    case 'checkpoint.created': {
      const d = data as unknown as CheckpointCreatedData;
      attrs['sutures.checkpoint.id'] = d.checkpoint_id;
      attrs['sutures.checkpoint.thread_id'] = d.thread_id;
      break;
    }

    // --- Intervention ---
    case 'breakpoint.set': {
      const d = data as unknown as BreakpointSetData;
      attrs['sutures.breakpoint.id'] = d.breakpoint_id;
      attrs['sutures.breakpoint.condition'] = d.condition;
      break;
    }
    case 'breakpoint.hit': {
      const d = data as unknown as BreakpointHitData;
      attrs['sutures.breakpoint.id'] = d.breakpoint_id;
      attrs['sutures.breakpoint.node_name'] = d.node_name;
      attrs['sutures.breakpoint.reason'] = d.reason;
      break;
    }

    // --- Cost ---
    case 'cost.tokens': {
      addCostTokenAttributes(attrs, data as unknown as CostTokensData);
      break;
    }
    case 'cost.api_call': {
      addCostApiCallAttributes(attrs, data as unknown as CostApiCallData);
      break;
    }

    // --- Memory Extensions ---
    case 'memory.tier_migration': {
      const d = data as unknown as MemoryTierMigrationData;
      attrs['sutures.memory.from_tier'] = d.from_tier;
      attrs['sutures.memory.to_tier'] = d.to_tier;
      attrs['sutures.memory.token_count'] = d.token_count;
      break;
    }
    case 'memory.conflict': {
      const d = data as unknown as MemoryConflictData;
      attrs['sutures.memory.tier'] = d.tier;
      attrs['sutures.memory.conflict.resolution'] = d.resolution;
      attrs['sutures.memory.conflict.agents'] = d.conflicting_agent_ids.join(',');
      break;
    }
    case 'memory.prune': {
      const d = data as unknown as MemoryPruneData;
      attrs['sutures.memory.tier'] = d.tier;
      attrs['sutures.memory.prune.entries'] = d.entries_pruned;
      attrs['sutures.memory.prune.tokens_freed'] = d.tokens_freed;
      break;
    }
    case 'memory.structure_switch': {
      const d = data as unknown as MemoryStructureSwitchData;
      attrs['sutures.memory.from_structure'] = d.from_structure;
      attrs['sutures.memory.to_structure'] = d.to_structure;
      break;
    }
    case 'memory.coherence_violation': {
      const d = data as unknown as MemoryCoherenceViolationData;
      attrs['sutures.memory.tier'] = d.tier;
      attrs['sutures.memory.expected_version'] = d.expected_version;
      attrs['sutures.memory.actual_version'] = d.actual_version;
      break;
    }

    // agent.idle, agent.paused, agent.resumed, turn.thought, turn.failed,
    // handoff.accepted, breakpoint.inject, breakpoint.release,
    // memory.reconsolidate — covered by base attributes + span events.
    default:
      break;
  }
}

// ----------------------------------------------------------------------------
// Public API
// ----------------------------------------------------------------------------

/**
 * Map an AgentEvent to an OpenTelemetry-compatible span data structure.
 *
 * This is a pure function with no side effects. The returned `OtelSpanData`
 * can be fed directly into any OTEL exporter.
 *
 * Mapping conventions:
 * - `swarm_id` -> `trace_id`
 * - `agent_id` -> `resource.agent.id` attribute
 * - `event_type` -> span name prefixed with `sutures.`
 * - Token counts -> `gen_ai.usage.*` (GenAI semantic conventions)
 * - Cost -> `sutures.cost.usd`
 */
export function mapEventToSpan(event: AgentEvent): OtelSpanData {
  const attrs = baseAttributes(event);
  enrichAttributes(attrs, event);

  const spanEvents: OtelSpanEvent[] = [
    {
      name: event.event_type,
      timestamp: event.timestamp,
      attributes: { 'sutures.severity': event.severity },
    },
  ];

  return {
    trace_id: event.swarm_id,
    span_id: uuidv7(),
    parent_span_id: event.parent_agent_id,
    name: `sutures.${event.event_type}`,
    start_time: event.timestamp,
    end_time: computeEndTime(event.timestamp, event.duration_ms),
    duration_ms: event.duration_ms,
    status: severityToStatus(event.severity),
    attributes: attrs,
    events: spanEvents,
  };
}
