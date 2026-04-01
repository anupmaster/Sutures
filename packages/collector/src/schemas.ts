/**
 * Zod schemas for AgentEvent protocol validation.
 *
 * Defined locally in the collector to keep packages loosely coupled.
 * These schemas validate the same shape as @sutures/core types.
 */

import { z } from 'zod';

// ── Event type enums ──────────────────────────────────────────────

export const AgentEventTypeSchema = z.enum([
  // Lifecycle (6)
  'agent.spawned',
  'agent.idle',
  'agent.completed',
  'agent.failed',
  'agent.paused',
  'agent.resumed',
  // Reasoning (7)
  'turn.started',
  'turn.thinking',
  'turn.thought',
  'turn.acting',
  'turn.observed',
  'turn.completed',
  'turn.failed',
  // Collaboration (4)
  'handoff.initiated',
  'handoff.accepted',
  'handoff.rejected',
  'handoff.completed',
  // Memory & State (3)
  'memory.write',
  'memory.read',
  'checkpoint.created',
  // Intervention (4)
  'breakpoint.set',
  'breakpoint.hit',
  'breakpoint.inject',
  'breakpoint.release',
  // Cost (2)
  'cost.tokens',
  'cost.api_call',
  // Memory Extensions (6)
  'memory.tier_migration',
  'memory.conflict',
  'memory.prune',
  'memory.reconsolidate',
  'memory.structure_switch',
  'memory.coherence_violation',
]);

export type AgentEventType = z.infer<typeof AgentEventTypeSchema>;

export const SeveritySchema = z.enum(['debug', 'info', 'warn', 'error', 'critical']);

export type Severity = z.infer<typeof SeveritySchema>;

// ── Base AgentEvent ───────────────────────────────────────────────

export const AgentEventSchema = z.object({
  event_id: z.string().min(1),
  swarm_id: z.string().min(1),
  agent_id: z.string().min(1),
  parent_agent_id: z.string().optional(),
  timestamp: z.string(), // ISO 8601
  duration_ms: z.number().nonnegative().optional(),
  event_type: AgentEventTypeSchema,
  severity: SeveritySchema,
  data: z.record(z.unknown()),
  protocol_version: z.literal('1.0.0'),
});

export type AgentEvent = z.infer<typeof AgentEventSchema>;

// ── Breakpoint condition types ────────────────────────────────────

export const BreakpointConditionTypeSchema = z.enum([
  'always',
  'on_turn',
  'on_tool',
  'on_handoff',
  'on_cost',
  'on_error',
  'on_score',
  'on_memory_tier_migration',
  'on_conflict_detected',
  'on_context_pressure',
  'on_memory_structure_switch',
  'on_memory_link_created',
  'on_cache_coherence_violation',
]);

export type BreakpointConditionType = z.infer<typeof BreakpointConditionTypeSchema>;

export const BreakpointConfigSchema = z.object({
  breakpoint_id: z.string().uuid().optional(),
  condition: BreakpointConditionTypeSchema,
  agent_id: z.string().optional(),
  swarm_id: z.string().optional(),
  /** Condition-specific threshold or matcher value */
  value: z.unknown().optional(),
  /** Whether the breakpoint is single-shot */
  once: z.boolean().optional(),
});

export type BreakpointConfig = z.infer<typeof BreakpointConfigSchema>;

// ── Checkpoint ────────────────────────────────────────────────────

export const CheckpointSchema = z.object({
  checkpoint_id: z.string(),
  thread_id: z.string(),
  agent_id: z.string(),
  swarm_id: z.string(),
  state: z.unknown(),
  memory_hierarchy: z.unknown().optional(),
  parent_checkpoint_id: z.string().optional(),
  created_at: z.string(),
});

export type Checkpoint = z.infer<typeof CheckpointSchema>;

// ── Swarm Topology ────────────────────────────────────────────────

export interface TopologyAgent {
  agent_id: string;
  parent_agent_id?: string;
  status: 'spawned' | 'idle' | 'thinking' | 'acting' | 'observing' | 'completed' | 'failed' | 'paused';
  name?: string;
  model?: string;
  spawned_at: string;
  completed_at?: string;
}

export interface TopologyEdge {
  from_agent_id: string;
  to_agent_id: string;
  type: 'handoff' | 'delegation';
  timestamp: string;
}

export interface SwarmTopology {
  swarm_id: string;
  agents: Record<string, TopologyAgent>;
  edges: TopologyEdge[];
  updated_at: string;
}

// ── Anomaly alerts ────────────────────────────────────────────────

export interface AnomalyAlert {
  type: 'infinite_loop' | 'cost_spike' | 'context_bloat' | 'handoff_cycle';
  agent_id: string;
  swarm_id: string;
  message: string;
  severity: Severity;
  detected_at: string;
  details: Record<string, unknown>;
}

// ── WebSocket message types ───────────────────────────────────────

export const CommandTypeSchema = z.enum([
  'set_breakpoint',
  'release_breakpoint',
  'inject_and_resume',
  'get_checkpoints',
  'fork_from_checkpoint',
  'get_topology',
  'get_events',
]);

export type CommandType = z.infer<typeof CommandTypeSchema>;

export const AdapterMessageSchema = z.object({
  type: z.literal('event'),
  payload: AgentEventSchema,
});

export type AdapterMessage = z.infer<typeof AdapterMessageSchema>;

export const DashboardCommandSchema = z.object({
  type: z.literal('command'),
  command: CommandTypeSchema,
  payload: z.record(z.unknown()).optional(),
});

export type DashboardCommand = z.infer<typeof DashboardCommandSchema>;

export const InboundMessageSchema = z.discriminatedUnion('type', [
  AdapterMessageSchema,
  DashboardCommandSchema,
]);

export type InboundMessage = z.infer<typeof InboundMessageSchema>;

export interface OutboundEventMessage {
  type: 'event';
  payload: AgentEvent;
}

export interface OutboundResponseMessage {
  type: 'response';
  command: string;
  data: unknown;
}

export interface OutboundTopologyMessage {
  type: 'topology';
  payload: SwarmTopology;
}

export interface OutboundAnomalyMessage {
  type: 'anomaly';
  payload: AnomalyAlert;
}

export type OutboundMessage =
  | OutboundEventMessage
  | OutboundResponseMessage
  | OutboundTopologyMessage
  | OutboundAnomalyMessage;
