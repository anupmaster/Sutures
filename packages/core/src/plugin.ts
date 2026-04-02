// ============================================================================
// Sutures Plugin System — Extensible registries for panels, tools, commands,
// and anomaly detectors.
// ============================================================================

import type { AgentEvent } from './types.js';

// ----------------------------------------------------------------------------
// Anomaly Detector Definition
// ----------------------------------------------------------------------------

export interface AnomalyAlert {
  type: string;
  agent_id: string;
  swarm_id: string;
  message: string;
  severity: 'debug' | 'info' | 'warn' | 'error' | 'critical';
  detected_at: string;
  details: Record<string, unknown>;
}

export interface AnomalyDetectorDefinition {
  /** Unique detector name (e.g. 'latency_spike'). */
  name: string;
  /** Evaluate an event and return alerts (or empty array). */
  evaluate(event: AgentEvent): AnomalyAlert[];
  /** Optional: reset detector state. */
  clear?(): void;
}

// ----------------------------------------------------------------------------
// Command Definition (collector)
// ----------------------------------------------------------------------------

export interface CommandContext {
  /** Send a response back to the requesting WebSocket. */
  sendResponse(command: string, data: unknown): void;
  /** Broadcast a message to all dashboard clients. */
  broadcastToDashboards(message: unknown): void;
  /** Broadcast a message to all adapter clients. */
  broadcastToAdapters(message: unknown): void;
  /** Access the ring buffer for event queries. */
  ringBuffer: {
    getRecent(limit: number): AgentEvent[];
    getBySwarmId(swarmId: string): AgentEvent[];
    getByAgentId(agentId: string): AgentEvent[];
    push(event: AgentEvent): void;
  };
}

export interface CommandDefinition {
  /** Command name (e.g. 'sync_datadog'). */
  name: string;
  /** Handle the command. */
  handler(payload: Record<string, unknown>, ctx: CommandContext): void | Promise<void>;
}

// ----------------------------------------------------------------------------
// MCP Tool Definition
// ----------------------------------------------------------------------------

export interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}

export interface ToolDefinition {
  /** Tool name (e.g. 'get_datadog_metrics'). */
  name: string;
  /** Human-readable description for the MCP client. */
  description: string;
  /** JSON Schema for the tool's input parameters. */
  inputSchema: Record<string, unknown>;
  /** Execute the tool and return a result. */
  handler(args: Record<string, unknown>): ToolResult | Promise<ToolResult>;
}

// ----------------------------------------------------------------------------
// Panel Definition (dashboard)
// ----------------------------------------------------------------------------

export interface PanelDefinition {
  /** Unique panel ID (e.g. 'datadog-metrics'). */
  id: string;
  /** Display label shown in the tab bar. */
  label: string;
  /** Lucide icon name (e.g. 'BarChart', 'Activity'). Must be a valid lucide-react export. */
  icon: string;
  /** Lazy-loading factory that returns the React component module. */
  component: () => Promise<{ default: unknown }>;
}

// ----------------------------------------------------------------------------
// Plugin Interface
// ----------------------------------------------------------------------------

export interface PluginContext {
  /** The collector's event stream — subscribe to real-time events. */
  onEvent?(handler: (event: AgentEvent) => void): () => void;
}

export interface SuturesPlugin {
  /** Unique plugin name (e.g. 'datadog', 'prometheus'). */
  name: string;
  /** Semver version string. */
  version: string;

  /** Dashboard panels to register. */
  panels?: PanelDefinition[];
  /** MCP tools to register. */
  tools?: ToolDefinition[];
  /** Collector commands to register. */
  commands?: CommandDefinition[];
  /** Anomaly detectors to register. */
  anomalyDetectors?: AnomalyDetectorDefinition[];

  /** Called when the plugin is loaded. */
  onLoad?(ctx: PluginContext): void | Promise<void>;
  /** Called when the plugin is unloaded. */
  onUnload?(): void | Promise<void>;
}

// ----------------------------------------------------------------------------
// Plugin Configuration
// ----------------------------------------------------------------------------

export type PluginEntry = string | [string, Record<string, unknown>];

export interface SuturesConfig {
  /** List of plugin package names, paths, or [name, options] tuples. */
  plugins?: PluginEntry[];
  /** Auto-discover sutures-plugin-* packages in node_modules. Default: true. */
  autoDiscover?: boolean;
}
