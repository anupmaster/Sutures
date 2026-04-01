// Dashboard-local type definitions — loosely coupled from @sutures/core

export type AgentState =
  | "idle"
  | "thinking"
  | "acting"
  | "paused"
  | "completed";

export type BreakpointCondition =
  | "always"
  | "on_turn"
  | "on_tool"
  | "on_handoff"
  | "on_cost"
  | "on_error"
  | "on_score"
  | "on_memory_tier_migration"
  | "on_conflict_detected"
  | "on_context_pressure"
  | "on_memory_structure_switch"
  | "on_memory_link_created"
  | "on_cache_coherence_violation";

export type EventCategory =
  | "lifecycle"
  | "reasoning"
  | "collaboration"
  | "memory"
  | "intervention"
  | "cost";

export interface AgentEvent {
  id: string;
  type: string;
  category: EventCategory;
  agentId: string;
  agentName: string;
  swarmId: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface AgentInfo {
  id: string;
  name: string;
  model: string;
  state: AgentState;
  turnCount: number;
  cumulativeCost: number;
  progress?: number;
  systemPromptHash?: string;
  parentId?: string;
  contextMessages: ContextMessage[];
  toolCalls: ToolCallRecord[];
}

export interface ContextMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  tokenCount?: number;
  timestamp: string;
}

export interface ToolCallRecord {
  turn: number;
  toolName: string;
  inputSummary: string;
  outputSummary: string;
  latencyMs: number;
  success: boolean;
  timestamp: string;
}

export interface HandoffEdgeData {
  id: string;
  sourceAgentId: string;
  targetAgentId: string;
  type: "delegation" | "escalation" | "broadcast" | "return";
  active: boolean;
  label?: string;
  timestamp: string;
}

export interface SwarmTopology {
  swarmId: string;
  swarmName: string;
  agents: AgentInfo[];
  edges: HandoffEdgeData[];
}

export interface Breakpoint {
  id: string;
  agentId?: string;
  condition: BreakpointCondition;
  params?: Record<string, unknown>;
  enabled: boolean;
  hitCount: number;
  createdAt: string;
}

export interface BreakpointHit {
  breakpointId: string;
  agentId: string;
  agentName: string;
  timestamp: string;
  eventId: string;
}

export type ConnectionStatus = "connected" | "connecting" | "disconnected";

export interface DashboardCommand {
  type: "command";
  command:
    | "set_breakpoint"
    | "release_breakpoint"
    | "inject_and_resume"
    | "remove_breakpoint"
    | "pause_all"
    | "resume_all";
  payload: Record<string, unknown>;
}

export interface SwarmSummary {
  id: string;
  name: string;
  agentCount: number;
  totalCost: number;
  startedAt: string;
}

// ── Memory Debugger Types ────────────────────────────

export type MemoryTier = "stm" | "mtm" | "ltm";

export interface MemoryEntry {
  key: string;
  value: string;
  tier: MemoryTier;
  heat: number; // 0-1, for pruning heatmap
  lastAccessed: string;
  createdAt: string;
  agentId: string;
  shared: boolean;
}

export interface MemoryTierSummary {
  tier: MemoryTier;
  entryCount: number;
  totalTokens: number;
  maxTokens: number;
}

export interface ContextPressure {
  agentId: string;
  usedTokens: number;
  maxTokens: number;
  percentage: number; // 0-100
}

export interface SharedMemoryKey {
  key: string;
  ownerAgentId: string;
  readerAgentIds: string[];
  lastUpdated: string;
  stale: boolean; // true if readers have outdated version
}

export interface MemoryMigrationEvent {
  key: string;
  fromTier: MemoryTier;
  toTier: MemoryTier;
  agentId: string;
  reason: string;
  timestamp: string;
}

export interface MemoryConflict {
  key: string;
  agentIds: string[];
  values: string[];
  timestamp: string;
}
