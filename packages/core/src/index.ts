// @sutures/core — Breakpoints for AI Agents

// Types
export type {
  // Event type unions
  LifecycleEventType,
  ReasoningEventType,
  CollaborationEventType,
  MemoryStateEventType,
  InterventionEventType,
  CostEventType,
  MemoryExtensionEventType,
  AgentEventType,
  Severity,

  // Base event
  AgentEvent,
  TypedAgentEvent,
  AgentEventDataMap,

  // Lifecycle payloads
  AgentSpawnedData,
  AgentIdleData,
  AgentCompletedData,
  AgentFailedData,
  AgentPausedData,
  AgentResumedData,

  // Reasoning payloads
  TurnStartedData,
  TurnThinkingData,
  TurnThoughtData,
  TurnActingData,
  TurnObservedData,
  TurnCompletedData,
  TurnFailedData,

  // Collaboration payloads
  HandoffInitiatedData,
  HandoffAcceptedData,
  HandoffRejectedData,
  HandoffCompletedData,

  // Memory & State payloads
  MemoryWriteData,
  MemoryReadData,
  CheckpointCreatedData,

  // Intervention payloads
  BreakpointSetData,
  BreakpointHitData,
  BreakpointInjectData,
  BreakpointReleaseData,

  // Cost payloads
  CostTokensData,
  CostApiCallData,

  // Memory extension payloads
  MemoryTierMigrationData,
  MemoryConflictData,
  MemoryPruneData,
  MemoryReconsolidateData,
  MemoryStructureSwitchData,
  MemoryCoherenceViolationData,

  // Topology
  AgentStatus,
  AgentNode,
  HandoffStatus,
  HandoffEdge,
  SwarmTopology,

  // Memory
  MemoryTier,
  MemoryEntry,
  MemoryHierarchy,
  SharedMemoryEntry,
  SharedMemoryMap,

  // Checkpoints
  CheckpointData,

  // Breakpoints
  BreakpointCondition,
  BreakpointParams,
  BreakpointConfig,

  // WebSocket messages
  AdapterEventMessage,
  DashboardCommandType,
  DashboardCommandMessage,
  CollectorBroadcastMessage,
  SuturesMessage,

  // Configuration
  SuturesClientConfig,

  // Adapter interface
  SuturesAdapter,

  // OTEL
  OtelSpanData,
  OtelSpanEvent,
} from './types.js';

// Client
export { SuturesClient, createSutures } from './client.js';
export type { BreakpointHandler } from './client.js';

// OTEL Mapper
export { mapEventToSpan } from './otel-mapper.js';
