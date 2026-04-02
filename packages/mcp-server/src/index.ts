#!/usr/bin/env node

/**
 * Sutures MCP Server — "Breakpoints for AI Agents"
 *
 * Exposes 18 debugging tools for multi-agent AI swarms via Model Context Protocol.
 * Connects to the Sutures Collector (HTTP + WebSocket) and provides topology inspection,
 * memory analysis, breakpoint management, and trace analysis to MCP clients like
 * Claude Code, Cursor, and other AI coding assistants.
 *
 * Usage:
 *   node dist/index.js
 *   npx @sutures/mcp-server
 *
 * Environment variables:
 *   SUTURES_COLLECTOR_HTTP — HTTP endpoint (default: http://localhost:9471)
 *   SUTURES_COLLECTOR_WS   — WebSocket endpoint (default: ws://localhost:9470/v1/dashboard)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { CollectorClient } from './collector-client.js';
import { ToolRegistry } from './toolRegistry.js';
import {
  handleListAgents,
  handleGetAgentState,
  handleGetTopology,
  handleGetErrors,
  handleGetSwarmSummary,
} from './tools/topology.js';
import {
  handleGetContextWindow,
  handleGetMemoryHierarchy,
  handleGetSharedMemoryMap,
  handleGetMemoryTraversalPath,
  handleSimulatePrune,
} from './tools/memory.js';
import {
  handleSetBreakpoint,
  handleReleaseBreakpoint,
  handleInjectAndResume,
  handleGetCheckpoints,
  handleForkFromCheckpoint,
} from './tools/breakpoints.js';
import {
  handleGetRootCause,
  handleGetCostBreakdown,
  handleExportTrace,
} from './tools/analysis.js';

import type {
  ListAgentsInput,
  GetAgentStateInput,
  GetTopologyInput,
  GetErrorsInput,
  GetSwarmSummaryInput,
  GetContextWindowInput,
  GetMemoryHierarchyInput,
  GetSharedMemoryMapInput,
  GetMemoryTraversalPathInput,
  SimulatePruneInput,
  SetBreakpointInput,
  ReleaseBreakpointInput,
  InjectAndResumeInput,
  GetCheckpointsInput,
  ForkFromCheckpointInput,
  GetRootCauseInput,
  GetCostBreakdownInput,
  ExportTraceInput,
} from './types.js';

// ── Constants ────────────────────────────────────────────────────

const BREAKPOINT_CONDITIONS = [
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
] as const;

// ── Tool Definitions ─────────────────────────────────────────────

const TOOLS = [
  // ── Topology (5) ──
  {
    name: 'list_agents',
    description:
      'List all agents in the current swarm with status, model, turn count, and cost. ' +
      'Use this to get an overview of all active agents.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        swarm_id: {
          type: 'string',
          description: 'Optional swarm ID filter. Omit to list agents from all swarms.',
        },
      },
    },
  },
  {
    name: 'get_agent_state',
    description:
      'Get the full state of a specific agent including recent messages, tool calls, ' +
      'memory events, config, and cost. Useful for deep-diving into a single agent.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID to inspect.',
        },
        swarm_id: {
          type: 'string',
          description: 'Optional swarm ID to narrow the search.',
        },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'get_topology',
    description:
      'Get the full swarm topology graph showing agents and handoff edges. ' +
      'Returns the directed graph of agent relationships and current statuses.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        swarm_id: {
          type: 'string',
          description: 'Optional swarm ID. Omit to get all swarm topologies.',
        },
      },
    },
  },
  {
    name: 'get_errors',
    description:
      'List all errors and failures across the swarm. Returns agent failures, ' +
      'turn failures, and any events with error/critical severity.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        swarm_id: {
          type: 'string',
          description: 'Optional swarm ID filter.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of events to scan. Default: 500.',
        },
      },
    },
  },
  {
    name: 'get_swarm_summary',
    description:
      'High-level summary of a swarm: agent count, total cost, duration, status breakdown, ' +
      'error count, handoff count. Great as a first call to understand the situation.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        swarm_id: {
          type: 'string',
          description: 'Optional swarm ID. Omit for all swarms.',
        },
      },
    },
  },

  // ── Memory (5) ──
  {
    name: 'get_context_window',
    description:
      "Get an agent's full context window with token counts per message. " +
      'Shows what the agent currently "sees" and context pressure level.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID to inspect.',
        },
        swarm_id: {
          type: 'string',
          description: 'Optional swarm ID.',
        },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'get_memory_hierarchy',
    description:
      'Get the 3-tier memory hierarchy (STM/MTM/LTM) for an agent with pressure percentage. ' +
      'Shows memory tier contents, migration history, and pruning stats.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID to inspect.',
        },
      },
      required: ['agent_id'],
    },
  },
  {
    name: 'get_shared_memory_map',
    description:
      'Show what each agent sees in shared memory plus staleness indicators. ' +
      'Reveals which agents have stale reads and any memory conflicts.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        swarm_id: {
          type: 'string',
          description: 'Optional swarm ID. Omit for all swarms.',
        },
      },
    },
  },
  {
    name: 'get_memory_traversal_path',
    description:
      'Trace the G-Memory graph traversal path for a specific decision. ' +
      'Shows which memory nodes were read before the agent made a decision.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID.',
        },
        decision_event_id: {
          type: 'string',
          description: 'The event ID of the decision to trace back from.',
        },
      },
      required: ['agent_id', 'decision_event_id'],
    },
  },
  {
    name: 'simulate_prune',
    description:
      'Preview what Focus Agent pruning would remove from context (dry run). ' +
      'Shows which messages would be pruned and estimated token savings without actually pruning.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: {
          type: 'string',
          description: 'The agent ID to simulate pruning for.',
        },
        strategy: {
          type: 'string',
          description: 'Pruning strategy: "focus_agent" (relevance-based) or "fifo" (oldest first). Default: "focus_agent".',
        },
        threshold: {
          type: 'number',
          description: 'Context pressure threshold (0.0-1.0). Default: 0.7.',
        },
      },
      required: ['agent_id'],
    },
  },

  // ── Breakpoints (5) ──
  {
    name: 'set_breakpoint',
    description:
      'Set a conditional breakpoint on an agent. When the condition is met, the agent ' +
      'pauses and you can inspect state, inject modifications, or resume. ' +
      'Supports 13 conditions: always, on_turn, on_tool, on_handoff, on_cost, on_error, ' +
      'on_score, on_memory_tier_migration, on_conflict_detected, on_context_pressure, ' +
      'on_memory_structure_switch, on_memory_link_created, on_cache_coherence_violation.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: {
          type: 'string',
          description: 'Agent ID to set breakpoint on. Use "*" for all agents. Omit for all agents.',
        },
        condition: {
          type: 'string',
          enum: [...BREAKPOINT_CONDITIONS],
          description: 'The breakpoint condition type.',
        },
        params: {
          type: 'object',
          description:
            'Condition-specific parameters. Examples: { tool_name: "search" } for on_tool, ' +
            '{ max_usd: 0.50 } for on_cost, { threshold: 0.8 } for on_context_pressure, ' +
            '{ turn_number: 5 } for on_turn, { once: true } for single-shot breakpoints.',
          properties: {
            tool_name: { type: 'string', description: 'Tool name for on_tool condition.' },
            max_usd: { type: 'number', description: 'Cost threshold for on_cost condition.' },
            threshold: { type: 'number', description: 'Numeric threshold for on_score, on_context_pressure.' },
            turn_number: { type: 'number', description: 'Turn number for on_turn condition.' },
            once: { type: 'boolean', description: 'If true, breakpoint fires only once.' },
            swarm_id: { type: 'string', description: 'Scope to a specific swarm.' },
          },
        },
      },
      required: ['condition'],
    },
  },
  {
    name: 'release_breakpoint',
    description: 'Remove a breakpoint by its ID. The agent will no longer pause on that condition.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        breakpoint_id: {
          type: 'string',
          description: 'The breakpoint ID to remove.',
        },
      },
      required: ['breakpoint_id'],
    },
  },
  {
    name: 'inject_and_resume',
    description:
      'Inject modified state into a paused agent and resume execution. ' +
      'You can append/replace messages, modify memory, or change other state channels. ' +
      'The agent must be paused at a breakpoint first.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: {
          type: 'string',
          description: 'The paused agent ID.',
        },
        injection_type: {
          type: 'string',
          enum: ['append', 'replace'],
          description: '"append" adds to existing state, "replace" overwrites it.',
        },
        channel: {
          type: 'string',
          description: 'The state channel to modify: "messages", "memory", or any custom channel name.',
        },
        content: {
          description:
            'The data to inject. For messages: an array of message objects. ' +
            'For memory: a key-value object. Format depends on the channel.',
        },
      },
      required: ['agent_id', 'injection_type', 'channel', 'content'],
    },
  },
  {
    name: 'get_checkpoints',
    description:
      'List available checkpoints for a thread. Checkpoints are serialized agent state snapshots ' +
      'that enable time-travel debugging. Use fork_from_checkpoint to replay from any checkpoint.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        thread_id: {
          type: 'string',
          description: 'The thread ID (usually the swarm_id) to list checkpoints for.',
        },
      },
      required: ['thread_id'],
    },
  },
  {
    name: 'fork_from_checkpoint',
    description:
      'Fork execution from a past checkpoint with optional state changes. ' +
      'Creates a new checkpoint branching from the specified one, enabling "what if" exploration.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        checkpoint_id: {
          type: 'string',
          description: 'The checkpoint ID to fork from.',
        },
        updates: {
          type: 'object',
          description: 'Optional state modifications to apply to the forked checkpoint.',
        },
      },
      required: ['checkpoint_id'],
    },
  },

  // ── Analysis (3) ──
  {
    name: 'get_root_cause',
    description:
      'AI-powered root cause analysis of a failure. Analyzes the event trace leading to an error, ' +
      'identifies contributing factors (infinite loops, cost spikes, memory conflicts, context pressure), ' +
      'and provides actionable recommendations.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        agent_id: {
          type: 'string',
          description: 'Optional agent ID to analyze. Omit to find the most recent error across all agents.',
        },
        swarm_id: {
          type: 'string',
          description: 'Optional swarm ID to scope the analysis.',
        },
        error_event_id: {
          type: 'string',
          description: 'Optional specific error event ID to analyze. Omit to analyze the most recent error.',
        },
      },
    },
  },
  {
    name: 'get_cost_breakdown',
    description:
      'Detailed cost breakdown by agent, model, and turn. Shows total spend, per-agent costs, ' +
      'per-model costs, token counts, and cost-per-turn metrics.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        swarm_id: {
          type: 'string',
          description: 'Optional swarm ID. Omit for all swarms.',
        },
      },
    },
  },
  {
    name: 'export_trace',
    description:
      'Export the current trace as JSON for sharing or replay. Includes events, topology, ' +
      'and summary statistics. Can be filtered by swarm or agent.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        swarm_id: {
          type: 'string',
          description: 'Optional swarm ID filter.',
        },
        agent_id: {
          type: 'string',
          description: 'Optional agent ID filter.',
        },
        limit: {
          type: 'number',
          description: 'Maximum number of events to export. Default: 1000.',
        },
      },
    },
  },
];

// ── Tool Registry Setup ─────────────────────────────────────────

function createToolRegistry(client: CollectorClient): ToolRegistry {
  const registry = new ToolRegistry();

  // Register all 18 built-in tools: pair each TOOLS definition with its handler
  const handlerMap: Record<string, (args: Record<string, unknown>) => Promise<{ content: Array<{ type: 'text'; text: string }> }>> = {
    list_agents: (args) => handleListAgents(client, args as unknown as ListAgentsInput),
    get_agent_state: (args) => handleGetAgentState(client, args as unknown as GetAgentStateInput),
    get_topology: (args) => handleGetTopology(client, args as unknown as GetTopologyInput),
    get_errors: (args) => handleGetErrors(client, args as unknown as GetErrorsInput),
    get_swarm_summary: (args) => handleGetSwarmSummary(client, args as unknown as GetSwarmSummaryInput),
    get_context_window: (args) => handleGetContextWindow(client, args as unknown as GetContextWindowInput),
    get_memory_hierarchy: (args) => handleGetMemoryHierarchy(client, args as unknown as GetMemoryHierarchyInput),
    get_shared_memory_map: (args) => handleGetSharedMemoryMap(client, args as unknown as GetSharedMemoryMapInput),
    get_memory_traversal_path: (args) => handleGetMemoryTraversalPath(client, args as unknown as GetMemoryTraversalPathInput),
    simulate_prune: (args) => handleSimulatePrune(client, args as unknown as SimulatePruneInput),
    set_breakpoint: (args) => handleSetBreakpoint(client, args as unknown as SetBreakpointInput),
    release_breakpoint: (args) => handleReleaseBreakpoint(client, args as unknown as ReleaseBreakpointInput),
    inject_and_resume: (args) => handleInjectAndResume(client, args as unknown as InjectAndResumeInput),
    get_checkpoints: (args) => handleGetCheckpoints(client, args as unknown as GetCheckpointsInput),
    fork_from_checkpoint: (args) => handleForkFromCheckpoint(client, args as unknown as ForkFromCheckpointInput),
    get_root_cause: (args) => handleGetRootCause(client, args as unknown as GetRootCauseInput),
    get_cost_breakdown: (args) => handleGetCostBreakdown(client, args as unknown as GetCostBreakdownInput),
    export_trace: (args) => handleExportTrace(client, args as unknown as ExportTraceInput),
  };

  for (const tool of TOOLS) {
    const handler = handlerMap[tool.name] as ((args: Record<string, unknown>) => Promise<{ content: Array<{ type: 'text'; text: string }> }>) | undefined;
    if (handler != null) {
      registry.register({ ...tool, inputSchema: tool.inputSchema as Record<string, unknown>, handler });
    }
  }

  return registry;
}

// ── Server Setup ─────────────────────────────────────────────────

async function main(): Promise<void> {
  const client = new CollectorClient();
  const toolRegistry = createToolRegistry(client);

  const server = new Server(
    {
      name: 'sutures',
      version: '0.1.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  );

  // Register tool listing — returns all registered tools (built-in + plugins)
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: toolRegistry.listDefinitions(),
  }));

  // Register tool execution — dispatches via ToolRegistry
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const toolName = request.params.name;
    const args = (request.params.arguments ?? {}) as Record<string, unknown>;

    try {
      const result = await toolRegistry.dispatch(toolName, args);
      return { ...result } as Record<string, unknown>;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              error: true,
              tool: toolName,
              message,
              hint: 'Is the Sutures Collector running? Start it with: npx @sutures/collector',
            }),
          },
        ],
        isError: true,
      };
    }
  });

  // Connect via stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Handle graceful shutdown
  const shutdown = async (): Promise<void> => {
    await client.disconnect();
    await server.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

main().catch((err) => {
  console.error('Failed to start Sutures MCP server:', err);
  process.exit(1);
});
