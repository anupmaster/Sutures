// ============================================================================
// Sutures Core Types — Breakpoints for AI Agents
// ============================================================================

// ----------------------------------------------------------------------------
// Event Types (32 total across 6 categories + memory extensions)
// ----------------------------------------------------------------------------

export type LifecycleEventType =
  | 'agent.spawned'
  | 'agent.idle'
  | 'agent.completed'
  | 'agent.failed'
  | 'agent.paused'
  | 'agent.resumed';

export type ReasoningEventType =
  | 'turn.started'
  | 'turn.thinking'
  | 'turn.thought'
  | 'turn.acting'
  | 'turn.observed'
  | 'turn.completed'
  | 'turn.failed';

export type CollaborationEventType =
  | 'handoff.initiated'
  | 'handoff.accepted'
  | 'handoff.rejected'
  | 'handoff.completed';

export type MemoryStateEventType =
  | 'memory.write'
  | 'memory.read'
  | 'checkpoint.created';

export type InterventionEventType =
  | 'breakpoint.set'
  | 'breakpoint.hit'
  | 'breakpoint.inject'
  | 'breakpoint.release';

export type CostEventType =
  | 'cost.tokens'
  | 'cost.api_call';

export type MemoryExtensionEventType =
  | 'memory.tier_migration'
  | 'memory.conflict'
  | 'memory.prune'
  | 'memory.reconsolidate'
  | 'memory.structure_switch'
  | 'memory.coherence_violation';

/** All 32 agent event types. */
export type AgentEventType =
  | LifecycleEventType
  | ReasoningEventType
  | CollaborationEventType
  | MemoryStateEventType
  | InterventionEventType
  | CostEventType
  | MemoryExtensionEventType;

// ----------------------------------------------------------------------------
// Severity
// ----------------------------------------------------------------------------

export type Severity = 'debug' | 'info' | 'warn' | 'error' | 'critical';

// ----------------------------------------------------------------------------
// Base Event
// ----------------------------------------------------------------------------

/** Base event envelope for all Sutures agent events. */
export interface AgentEvent<T = unknown> {
  /** UUIDv7 (time-ordered) */
  event_id: string;
  /** Top-level trace / swarm identifier */
  swarm_id: string;
  /** Agent that emitted this event */
  agent_id: string;
  /** Supervisor agent (if any) */
  parent_agent_id?: string;
  /** ISO 8601 with microsecond precision */
  timestamp: string;
  /** Duration of the operation in milliseconds */
  duration_ms?: number;
  /** Discriminator for the event */
  event_type: AgentEventType;
  /** Log severity */
  severity: Severity;
  /** Type-specific payload */
  data: T;
  /** Protocol version — always '1.0.0' for this release */
  protocol_version: '1.0.0';
}

// ----------------------------------------------------------------------------
// Event Data Payloads
// ----------------------------------------------------------------------------

// --- Lifecycle ---

export interface AgentSpawnedData {
  name: string;
  role: string;
  model: string;
  tools: string[];
  system_prompt_hash: string;
  parent_agent_id?: string;
}

export interface AgentIdleData {
  reason: string;
  idle_since: string;
}

export interface AgentCompletedData {
  result_summary: string;
  total_turns: number;
  total_tokens: number;
  total_cost_usd: number;
}

export interface AgentFailedData {
  error_type: string;
  error_message: string;
  stack_trace?: string;
  recoverable: boolean;
}

export interface AgentPausedData {
  reason: string;
  breakpoint_id?: string;
}

export interface AgentResumedData {
  resumed_by: string;
  injected_state?: Record<string, unknown>;
}

// --- Reasoning ---

export interface TurnStartedData {
  turn_number: number;
  input_summary: string;
  input_tokens: number;
}

export interface TurnThinkingData {
  turn_number: number;
  model: string;
  prompt_tokens: number;
}

export interface TurnThoughtData {
  turn_number: number;
  reasoning_summary: string;
  confidence?: number;
}

export interface TurnActingData {
  turn_number: number;
  tool_name: string;
  tool_input_summary: string;
}

export interface TurnObservedData {
  turn_number: number;
  tool_name: string;
  tool_output_summary: string;
  output_tokens: number;
}

export interface TurnCompletedData {
  turn_number: number;
  output_summary: string;
  output_tokens: number;
  total_tokens: number;
  duration_ms: number;
}

export interface TurnFailedData {
  turn_number: number;
  error_type: string;
  error_message: string;
  recoverable: boolean;
}

// --- Collaboration ---

export interface HandoffInitiatedData {
  source_agent_id: string;
  target_agent_id: string;
  reason: string;
  payload_summary: string;
}

export interface HandoffAcceptedData {
  source_agent_id: string;
  target_agent_id: string;
  handoff_id: string;
}

export interface HandoffRejectedData {
  source_agent_id: string;
  target_agent_id: string;
  handoff_id: string;
  rejection_reason: string;
}

export interface HandoffCompletedData {
  source_agent_id: string;
  target_agent_id: string;
  handoff_id: string;
  result_summary: string;
}

// --- Memory & State ---

export interface MemoryWriteData {
  key: string;
  tier: MemoryTier;
  token_count: number;
  content_summary: string;
}

export interface MemoryReadData {
  key: string;
  tier: MemoryTier;
  token_count: number;
  hit: boolean;
}

export interface CheckpointCreatedData {
  checkpoint_id: string;
  thread_id: string;
  state_summary: string;
  parent_checkpoint_id?: string;
}

// --- Intervention ---

export interface BreakpointSetData {
  breakpoint_id: string;
  condition: BreakpointCondition;
  params?: BreakpointParams;
}

export interface BreakpointHitData {
  breakpoint_id: string;
  agent_id: string;
  node_name: string;
  state_snapshot: Record<string, unknown>;
  reason: string;
}

export interface BreakpointInjectData {
  target_agent_id: string;
  injection_type: 'append' | 'replace';
  channel: string;
  content: string;
}

export interface BreakpointReleaseData {
  breakpoint_id: string;
  agent_id: string;
  released_by: string;
}

// --- Cost ---

export interface CostTokensData {
  model: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_usd: number;
  cumulative_cost_usd: number;
}

export interface CostApiCallData {
  provider: string;
  model: string;
  endpoint: string;
  status_code: number;
  latency_ms: number;
  cost_usd: number;
}

// --- Memory Extensions ---

export interface MemoryTierMigrationData {
  entry_id: string;
  from_tier: MemoryTier;
  to_tier: MemoryTier;
  reason: string;
  token_count: number;
}

export interface MemoryConflictData {
  entry_id: string;
  conflicting_agent_ids: string[];
  resolution: 'latest_wins' | 'merge' | 'manual';
  tier: MemoryTier;
}

export interface MemoryPruneData {
  tier: MemoryTier;
  entries_pruned: number;
  tokens_freed: number;
  reason: string;
}

export interface MemoryReconsolidateData {
  tier: MemoryTier;
  entries_affected: number;
  summary: string;
}

export interface MemoryStructureSwitchData {
  from_structure: string;
  to_structure: string;
  reason: string;
}

export interface MemoryCoherenceViolationData {
  entry_id: string;
  agent_id: string;
  expected_version: number;
  actual_version: number;
  tier: MemoryTier;
}

// ----------------------------------------------------------------------------
// Typed Event Map
// ----------------------------------------------------------------------------

export interface AgentEventDataMap {
  'agent.spawned': AgentSpawnedData;
  'agent.idle': AgentIdleData;
  'agent.completed': AgentCompletedData;
  'agent.failed': AgentFailedData;
  'agent.paused': AgentPausedData;
  'agent.resumed': AgentResumedData;
  'turn.started': TurnStartedData;
  'turn.thinking': TurnThinkingData;
  'turn.thought': TurnThoughtData;
  'turn.acting': TurnActingData;
  'turn.observed': TurnObservedData;
  'turn.completed': TurnCompletedData;
  'turn.failed': TurnFailedData;
  'handoff.initiated': HandoffInitiatedData;
  'handoff.accepted': HandoffAcceptedData;
  'handoff.rejected': HandoffRejectedData;
  'handoff.completed': HandoffCompletedData;
  'memory.write': MemoryWriteData;
  'memory.read': MemoryReadData;
  'checkpoint.created': CheckpointCreatedData;
  'breakpoint.set': BreakpointSetData;
  'breakpoint.hit': BreakpointHitData;
  'breakpoint.inject': BreakpointInjectData;
  'breakpoint.release': BreakpointReleaseData;
  'cost.tokens': CostTokensData;
  'cost.api_call': CostApiCallData;
  'memory.tier_migration': MemoryTierMigrationData;
  'memory.conflict': MemoryConflictData;
  'memory.prune': MemoryPruneData;
  'memory.reconsolidate': MemoryReconsolidateData;
  'memory.structure_switch': MemoryStructureSwitchData;
  'memory.coherence_violation': MemoryCoherenceViolationData;
}

/** A fully typed agent event for a specific event type. */
export type TypedAgentEvent<K extends AgentEventType> = AgentEvent<AgentEventDataMap[K]> & {
  event_type: K;
};

// ----------------------------------------------------------------------------
// Topology
// ----------------------------------------------------------------------------

export type AgentStatus = 'spawned' | 'idle' | 'running' | 'paused' | 'completed' | 'failed';

export interface AgentNode {
  id: string;
  name: string;
  role: string;
  model: string;
  status: AgentStatus;
  tools: string[];
  token_usage: number;
  cost_usd: number;
  turn_count: number;
  parent_agent_id?: string;
}

export type HandoffStatus = 'initiated' | 'accepted' | 'rejected' | 'completed';

export interface HandoffEdge {
  source_agent_id: string;
  target_agent_id: string;
  status: HandoffStatus;
  payload_summary: string;
}

export interface SwarmTopology {
  agents: Map<string, AgentNode>;
  edges: HandoffEdge[];
  active_count: number;
}

// ----------------------------------------------------------------------------
// Memory
// ----------------------------------------------------------------------------

export type MemoryTier = 'stm' | 'mtm' | 'ltm';

export interface MemoryEntry {
  id: string;
  tier: MemoryTier;
  content: string;
  token_count: number;
  heat_score: number;
  created_at: string;
  updated_at: string;
  links: string[];
}

export interface MemoryHierarchy {
  stm: MemoryEntry[];
  mtm: MemoryEntry[];
  ltm: MemoryEntry[];
  total_tokens: number;
  pressure_percent: number;
}

export interface SharedMemoryEntry {
  entry: MemoryEntry;
  owner_agent_id: string;
  staleness_ms: number;
}

export type SharedMemoryMap = Map<string, SharedMemoryEntry[]>;

// ----------------------------------------------------------------------------
// Checkpoints
// ----------------------------------------------------------------------------

export interface CheckpointData {
  checkpoint_id: string;
  thread_id: string;
  agent_id: string;
  state: Record<string, unknown>;
  memory_hierarchy: MemoryHierarchy;
  timestamp: string;
  parent_checkpoint_id?: string;
}

// ----------------------------------------------------------------------------
// Breakpoints
// ----------------------------------------------------------------------------

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

export interface BreakpointParams {
  tool_name?: string;
  max_usd?: number;
  threshold?: number;
  turn_number?: number;
  tier?: MemoryTier;
  agent_id?: string;
}

export interface BreakpointConfig {
  id: string;
  agent_id: string;
  condition: BreakpointCondition;
  params?: BreakpointParams;
  enabled: boolean;
}

// ----------------------------------------------------------------------------
// WebSocket Message Protocol
// ----------------------------------------------------------------------------

/** Message sent from adapter to collector. */
export interface AdapterEventMessage {
  type: 'event';
  payload: AgentEvent;
}

/** Command types that the dashboard can send to the collector. */
export type DashboardCommandType =
  | 'set_breakpoint'
  | 'release'
  | 'inject'
  | 'resume'
  | 'get_checkpoints'
  | 'fork';

/** Message sent from dashboard to collector. */
export interface DashboardCommandMessage {
  type: 'command';
  command: DashboardCommandType;
  payload: Record<string, unknown>;
}

/** Message sent from collector to dashboard. */
export interface CollectorBroadcastMessage {
  type: 'event' | 'state' | 'topology';
  payload: AgentEvent | SwarmTopology | Record<string, unknown>;
}

/** Union of all WebSocket message types. */
export type SuturesMessage =
  | AdapterEventMessage
  | DashboardCommandMessage
  | CollectorBroadcastMessage;

// ----------------------------------------------------------------------------
// Client Configuration
// ----------------------------------------------------------------------------

export interface SuturesClientConfig {
  /** WebSocket URL. Default: ws://localhost:9470/v1/events */
  url?: string;
  /** Swarm / trace identifier. Auto-generated if omitted. */
  swarm_id?: string;
  /** Agent identifier. Required for single-agent use; adapters manage this per-agent. */
  agent_id?: string;
  /** Parent agent ID (supervisor). */
  parent_agent_id?: string;
  /** Maximum queued events while disconnected. Default: 1000 */
  buffer_limit?: number;
  /** Maximum reconnect delay in ms. Default: 30000 */
  max_reconnect_delay_ms?: number;
  /** Enable automatic reconnection. Default: true */
  auto_reconnect?: boolean;
}

// ----------------------------------------------------------------------------
// Adapter Interface
// ----------------------------------------------------------------------------

/** Interface that framework adapters must implement. */
export interface SuturesAdapter {
  /** Unique adapter name (e.g. 'langgraph', 'crewai'). */
  readonly name: string;

  /** Start tracing an agent run. */
  attach(config: SuturesClientConfig): void;

  /** Stop tracing and flush remaining events. */
  detach(): Promise<void>;

  /** Check if the adapter is currently attached and streaming. */
  isAttached(): boolean;
}

// ----------------------------------------------------------------------------
// OTEL Span Representation
// ----------------------------------------------------------------------------

export interface OtelSpanData {
  trace_id: string;
  span_id: string;
  parent_span_id?: string;
  name: string;
  start_time: string;
  end_time?: string;
  duration_ms?: number;
  status: 'ok' | 'error' | 'unset';
  attributes: Record<string, string | number | boolean>;
  events: OtelSpanEvent[];
}

export interface OtelSpanEvent {
  name: string;
  timestamp: string;
  attributes: Record<string, string | number | boolean>;
}
