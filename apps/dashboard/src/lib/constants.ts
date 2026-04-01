import type { AgentState, BreakpointCondition, EventCategory } from "./types";

// --- Ports ---
export const WS_PORT = 9470;
export const HTTP_PORT = 9471;
export const UI_PORT = 9472;
export const OTEL_GRPC_PORT = 4317;
export const OTEL_HTTP_PORT = 4318;

export const WS_URL = `ws://localhost:${WS_PORT}/v1/dashboard`;

// --- Agent state colors ---
export const STATE_COLORS: Record<AgentState, string> = {
  idle: "#6B7280",
  thinking: "#F59E0B",
  acting: "#3B82F6",
  paused: "#EF4444",
  completed: "#10B981",
};

// --- Memory type colors ---
export const MEMORY_COLORS = {
  stm: "#10B981",
  mtm: "#F59E0B",
  ltm: "#8B5CF6",
  shared: "#3B82F6",
  stale: "#EF4444",
} as const;

// --- Pressure colors ---
export const PRESSURE_COLORS = {
  safe: "#10B981",
  high: "#F59E0B",
  cliff: "#EF4444",
} as const;

// --- Surface colors ---
export const SURFACES = {
  bg: "#0A0A0B",
  secondary: "#111113",
  elevated: "#1A1A1D",
  surface: "#222225",
} as const;

// --- Text colors ---
export const TEXT = {
  primary: "#F5F5F5",
  secondary: "#A1A1AA",
  muted: "#71717A",
} as const;

// --- Brand ---
export const BRAND = {
  DEFAULT: "#10B981",
  hover: "#059669",
} as const;

// --- Handoff edge colors ---
export const HANDOFF_COLORS: Record<string, string> = {
  delegation: "#3B82F6",
  escalation: "#F59E0B",
  broadcast: "#8B5CF6",
  return: "#6B7280",
};

// --- Event category labels ---
export const CATEGORY_LABELS: Record<EventCategory, string> = {
  lifecycle: "Lifecycle",
  reasoning: "Reasoning",
  collaboration: "Collaboration",
  memory: "Memory",
  intervention: "Intervention",
  cost: "Cost",
};

// --- Breakpoint condition labels ---
export const BREAKPOINT_LABELS: Record<BreakpointCondition, string> = {
  always: "Always",
  on_turn: "On Turn",
  on_tool: "On Tool Call",
  on_handoff: "On Handoff",
  on_cost: "On Cost Threshold",
  on_error: "On Error",
  on_score: "On Quality Score",
  on_memory_tier_migration: "Memory Tier Migration",
  on_conflict_detected: "Memory Conflict",
  on_context_pressure: "Context Pressure",
  on_memory_structure_switch: "Memory Structure Switch",
  on_memory_link_created: "Memory Link Created",
  on_cache_coherence_violation: "Cache Coherence Violation",
};

// --- Event store cap ---
export const MAX_EVENTS = 5000;

// --- Layout ---
export const ELK_LAYOUT_THROTTLE_MS = 1000;
export const WS_BATCH_INTERVAL_MS = 50;
