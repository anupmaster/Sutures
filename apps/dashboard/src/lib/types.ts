// Dashboard-local type definitions — loosely coupled from @sutures/core

export type AgentState =
  | "idle"
  | "thinking"
  | "acting"
  | "paused"
  | "completed";

export type BreakpointCondition =
  | "on_turn"
  | "on_tool"
  | "on_cost"
  | "on_error"
  | "on_handoff"
  | "always";

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
