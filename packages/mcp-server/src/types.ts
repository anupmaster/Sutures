/**
 * Local type definitions for the MCP server.
 *
 * Kept loosely coupled from @sutures/core — these mirror the collector's
 * schemas so the MCP server can operate independently.
 */

// ── Agent Event Types ────────────────────────────────────────────

export type AgentEventType =
  | 'agent.spawned'
  | 'agent.idle'
  | 'agent.completed'
  | 'agent.failed'
  | 'agent.paused'
  | 'agent.resumed'
  | 'turn.started'
  | 'turn.thinking'
  | 'turn.thought'
  | 'turn.acting'
  | 'turn.observed'
  | 'turn.completed'
  | 'turn.failed'
  | 'handoff.initiated'
  | 'handoff.accepted'
  | 'handoff.rejected'
  | 'handoff.completed'
  | 'memory.write'
  | 'memory.read'
  | 'checkpoint.created'
  | 'breakpoint.set'
  | 'breakpoint.hit'
  | 'breakpoint.inject'
  | 'breakpoint.release'
  | 'cost.tokens'
  | 'cost.api_call'
  | 'memory.tier_migration'
  | 'memory.conflict'
  | 'memory.prune'
  | 'memory.reconsolidate'
  | 'memory.structure_switch'
  | 'memory.coherence_violation';

export type Severity = 'debug' | 'info' | 'warn' | 'error' | 'critical';

export interface AgentEvent {
  event_id: string;
  swarm_id: string;
  agent_id: string;
  parent_agent_id?: string;
  timestamp: string;
  duration_ms?: number;
  event_type: AgentEventType;
  severity: Severity;
  data: Record<string, unknown>;
  protocol_version: string;
}

// ── Topology ─────────────────────────────────────────────────────

export type AgentStatus =
  | 'spawned'
  | 'idle'
  | 'thinking'
  | 'acting'
  | 'observing'
  | 'completed'
  | 'failed'
  | 'paused';

export interface TopologyAgent {
  agent_id: string;
  parent_agent_id?: string;
  status: AgentStatus;
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

// ── Breakpoints ──────────────────────────────────────────────────

export type BreakpointCondition =
  | 'always'
  | 'on_turn'
  | 'on_tool'
  | 'on_handoff'
  | 'on_cost'
  | 'on_error'
  | 'on_score'
  | 'on_memory_tier_migration'
  | 'on_conflict_detected'
  | 'on_context_pressure'
  | 'on_memory_structure_switch'
  | 'on_memory_link_created'
  | 'on_cache_coherence_violation';

export interface BreakpointConfig {
  breakpoint_id?: string;
  condition: BreakpointCondition;
  agent_id?: string;
  swarm_id?: string;
  value?: unknown;
  once?: boolean;
}

// ── Checkpoints ──────────────────────────────────────────────────

export interface Checkpoint {
  checkpoint_id: string;
  thread_id: string;
  agent_id: string;
  swarm_id: string;
  state: unknown;
  memory_hierarchy?: unknown;
  parent_checkpoint_id?: string;
  created_at: string;
}

// ── Collector Response Types ─────────────────────────────────────

export interface CollectorHealthResponse {
  status: string;
  service: string;
  adapters: number;
  dashboards: number;
  events: number;
  breakpoints?: number;
  timestamp: string;
}

export interface TopologyResponse {
  topology?: SwarmTopology | null;
  topologies?: Record<string, SwarmTopology>;
}

export interface EventsResponse {
  events: AgentEvent[];
}

export interface CheckpointsResponse {
  checkpoints: Checkpoint[];
}

export interface BreakpointsResponse {
  breakpoints: BreakpointConfig[];
}

// ── WebSocket Message Types ──────────────────────────────────────

export interface WsCommand {
  type: 'command';
  command: string;
  payload: Record<string, unknown>;
}

export interface WsResponse {
  type: 'response';
  command: string;
  data: Record<string, unknown>;
}

export interface WsEventMessage {
  type: 'event';
  payload: AgentEvent;
}

export interface WsTopologyMessage {
  type: 'topology';
  payload: SwarmTopology;
}

export type WsInboundMessage =
  | WsResponse
  | WsEventMessage
  | WsTopologyMessage;

// ── Tool Input Types ─────────────────────────────────────────────

export interface ListAgentsInput {
  swarm_id?: string;
}

export interface GetAgentStateInput {
  agent_id: string;
  swarm_id?: string;
}

export interface GetTopologyInput {
  swarm_id?: string;
}

export interface GetErrorsInput {
  swarm_id?: string;
  limit?: number;
}

export interface GetSwarmSummaryInput {
  swarm_id?: string;
}

export interface GetContextWindowInput {
  agent_id: string;
  swarm_id?: string;
}

export interface GetMemoryHierarchyInput {
  agent_id: string;
}

export interface GetSharedMemoryMapInput {
  swarm_id?: string;
}

export interface GetMemoryTraversalPathInput {
  agent_id: string;
  decision_event_id: string;
}

export interface SimulatePruneInput {
  agent_id: string;
  strategy?: string;
  threshold?: number;
}

export interface SetBreakpointInput {
  agent_id?: string;
  condition: BreakpointCondition;
  params?: Record<string, unknown>;
}

export interface ReleaseBreakpointInput {
  breakpoint_id: string;
}

export interface InjectAndResumeInput {
  agent_id: string;
  injection_type: 'append' | 'replace';
  channel: string;
  content: unknown;
}

export interface GetCheckpointsInput {
  thread_id: string;
}

export interface ForkFromCheckpointInput {
  checkpoint_id: string;
  updates?: Record<string, unknown>;
}

export interface GetRootCauseInput {
  agent_id?: string;
  swarm_id?: string;
  error_event_id?: string;
}

export interface GetCostBreakdownInput {
  swarm_id?: string;
}

export interface ExportTraceInput {
  swarm_id?: string;
  agent_id?: string;
  limit?: number;
}

// ── Shadow Tool Input Types ─────────────────────────────────────

export interface SpawnShadowInput {
  checkpoint_id: string;
  description?: string;
}

export interface PromoteShadowInput {
  shadow_id: string;
}

export interface ListShadowsInput {
  swarm_id?: string;
}
