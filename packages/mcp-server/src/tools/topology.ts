/**
 * Topology tools — 5 tools for inspecting swarm structure and agent state.
 *
 * 1. list_agents      — List all agents with status, model, turn count, cost
 * 2. get_agent_state  — Full state of a specific agent
 * 3. get_topology     — Full swarm topology graph
 * 4. get_errors       — List all errors/failures
 * 5. get_swarm_summary — High-level summary
 */

import type { CollectorClient } from '../collector-client.js';
import type {
  AgentEvent,
  GetAgentStateInput,
  GetErrorsInput,
  GetSwarmSummaryInput,
  GetTopologyInput,
  ListAgentsInput,
  SwarmTopology,
  TopologyAgent,
} from '../types.js';

/** Helper to produce MCP text content. */
function textContent(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text', text }] };
}

// ── list_agents ──────────────────────────────────────────────────

export async function handleListAgents(
  client: CollectorClient,
  args: ListAgentsInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const topologies = await client.getAllTopologies();

  const agents: Array<{
    agent_id: string;
    swarm_id: string;
    name?: string;
    status: string;
    model?: string;
    turn_count: number;
    total_cost_usd: number;
  }> = [];

  const swarmIds = args.swarm_id ? [args.swarm_id] : Object.keys(topologies);

  for (const swarmId of swarmIds) {
    const topo = topologies[swarmId];
    if (!topo) continue;

    // Fetch events for cost and turn counting
    const events = await client.getSwarmEvents(swarmId, 1000);

    for (const agent of Object.values(topo.agents)) {
      const agentEvents = events.filter((e) => e.agent_id === agent.agent_id);
      const turnCount = agentEvents.filter((e) => e.event_type === 'turn.completed').length;
      const totalCost = sumCost(agentEvents);

      agents.push({
        agent_id: agent.agent_id,
        swarm_id: swarmId,
        name: agent.name,
        status: agent.status,
        model: agent.model,
        turn_count: turnCount,
        total_cost_usd: totalCost,
      });
    }
  }

  if (agents.length === 0) {
    return textContent('No agents found. The swarm may not have started yet or no events have been received.');
  }

  return textContent({ agent_count: agents.length, agents });
}

// ── get_agent_state ──────────────────────────────────────────────

export async function handleGetAgentState(
  client: CollectorClient,
  args: GetAgentStateInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const topologies = await client.getAllTopologies();

  // Find the agent across all swarms
  let agentInfo: TopologyAgent | undefined;
  let swarmId: string | undefined;

  if (args.swarm_id && topologies[args.swarm_id]) {
    agentInfo = topologies[args.swarm_id].agents[args.agent_id];
    swarmId = args.swarm_id;
  } else {
    for (const [sid, topo] of Object.entries(topologies)) {
      if (topo.agents[args.agent_id]) {
        agentInfo = topo.agents[args.agent_id];
        swarmId = sid;
        break;
      }
    }
  }

  if (!agentInfo || !swarmId) {
    return textContent(`Agent '${args.agent_id}' not found in any active swarm.`);
  }

  const events = await client.getAgentEvents(args.agent_id, 500);

  // Extract messages (turn events with content)
  const messages = events
    .filter((e) => e.event_type === 'turn.thought' || e.event_type === 'turn.observed')
    .map((e) => ({
      event_type: e.event_type,
      timestamp: e.timestamp,
      content: e.data['summary'] ?? e.data['content'] ?? e.data['thought'],
      role: e.data['role'],
    }));

  // Extract tool calls
  const toolCalls = events
    .filter((e) => e.event_type === 'turn.acting')
    .map((e) => ({
      timestamp: e.timestamp,
      tool_name: e.data['tool_name'],
      tool_input: e.data['tool_input'],
    }));

  // Memory events
  const memoryEvents = events
    .filter((e) => e.event_type.startsWith('memory.'))
    .map((e) => ({
      event_type: e.event_type,
      timestamp: e.timestamp,
      data: e.data,
    }));

  // Config from spawned event
  const spawnedEvent = events.find((e) => e.event_type === 'agent.spawned');
  const config = spawnedEvent?.data ?? {};

  const turnCount = events.filter((e) => e.event_type === 'turn.completed').length;
  const totalCost = sumCost(events);

  return textContent({
    agent_id: args.agent_id,
    swarm_id: swarmId,
    name: agentInfo.name,
    status: agentInfo.status,
    model: agentInfo.model,
    spawned_at: agentInfo.spawned_at,
    completed_at: agentInfo.completed_at,
    turn_count: turnCount,
    total_cost_usd: totalCost,
    config,
    recent_messages: messages.slice(-20),
    recent_tool_calls: toolCalls.slice(-20),
    memory_events: memoryEvents.slice(-10),
    total_events: events.length,
  });
}

// ── get_topology ─────────────────────────────────────────────────

export async function handleGetTopology(
  client: CollectorClient,
  args: GetTopologyInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  if (args.swarm_id) {
    const resp = await client.getTopology(args.swarm_id);
    if (!resp.topology) {
      return textContent(`No topology found for swarm '${args.swarm_id}'.`);
    }
    return textContent(formatTopology(resp.topology));
  }

  const topologies = await client.getAllTopologies();
  if (Object.keys(topologies).length === 0) {
    return textContent('No active swarms. The collector has not received any events yet.');
  }

  const result = Object.entries(topologies).map(([, topo]) => formatTopology(topo));
  return textContent({ swarm_count: result.length, swarms: result });
}

// ── get_errors ───────────────────────────────────────────────────

export async function handleGetErrors(
  client: CollectorClient,
  args: GetErrorsInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const limit = args.limit ?? 500;
  const events = args.swarm_id
    ? await client.getSwarmEvents(args.swarm_id, limit)
    : (await client.getEvents({ limit })).events;

  const errorEvents = events.filter(
    (e) =>
      e.event_type === 'agent.failed' ||
      e.event_type === 'turn.failed' ||
      e.severity === 'error' ||
      e.severity === 'critical',
  );

  if (errorEvents.length === 0) {
    return textContent('No errors found. All agents are operating normally.');
  }

  const errors = errorEvents.map((e) => ({
    event_id: e.event_id,
    agent_id: e.agent_id,
    swarm_id: e.swarm_id,
    event_type: e.event_type,
    severity: e.severity,
    timestamp: e.timestamp,
    error_message: e.data['error'] ?? e.data['message'] ?? e.data['reason'],
    error_code: e.data['error_code'],
    stack_trace: e.data['stack_trace'],
  }));

  return textContent({ error_count: errors.length, errors });
}

// ── get_swarm_summary ────────────────────────────────────────────

export async function handleGetSwarmSummary(
  client: CollectorClient,
  args: GetSwarmSummaryInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const topologies = await client.getAllTopologies();
  const swarmIds = args.swarm_id ? [args.swarm_id] : Object.keys(topologies);

  if (swarmIds.length === 0) {
    return textContent('No active swarms found.');
  }

  const summaries = [];

  for (const swarmId of swarmIds) {
    const topo = topologies[swarmId];
    if (!topo) continue;

    const agents = Object.values(topo.agents);
    const events = await client.getSwarmEvents(swarmId, 1000);

    const statusBreakdown: Record<string, number> = {};
    for (const agent of agents) {
      statusBreakdown[agent.status] = (statusBreakdown[agent.status] ?? 0) + 1;
    }

    const totalCost = sumCost(events);
    const totalTurns = events.filter((e) => e.event_type === 'turn.completed').length;
    const errorCount = events.filter(
      (e) => e.event_type === 'agent.failed' || e.event_type === 'turn.failed',
    ).length;
    const handoffCount = events.filter((e) => e.event_type === 'handoff.completed').length;

    // Duration
    const timestamps = events.map((e) => new Date(e.timestamp).getTime()).filter((t) => !isNaN(t));
    const durationMs = timestamps.length >= 2
      ? Math.max(...timestamps) - Math.min(...timestamps)
      : 0;

    summaries.push({
      swarm_id: swarmId,
      agent_count: agents.length,
      status_breakdown: statusBreakdown,
      total_turns: totalTurns,
      total_handoffs: handoffCount,
      total_cost_usd: totalCost,
      error_count: errorCount,
      duration_ms: durationMs,
      duration_human: formatDuration(durationMs),
      edge_count: topo.edges.length,
      updated_at: topo.updated_at,
    });
  }

  if (summaries.length === 1) {
    return textContent(summaries[0]);
  }
  return textContent({ swarm_count: summaries.length, swarms: summaries });
}

// ── Helpers ──────────────────────────────────────────────────────

function sumCost(events: AgentEvent[]): number {
  let total = 0;
  for (const e of events) {
    if (e.event_type === 'cost.tokens' || e.event_type === 'cost.api_call') {
      const cost = e.data['cost_usd'];
      if (typeof cost === 'number') {
        total += cost;
      }
    }
  }
  return Math.round(total * 1_000_000) / 1_000_000; // Avoid floating point drift
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatTopology(topo: SwarmTopology): Record<string, unknown> {
  const agents = Object.values(topo.agents).map((a) => ({
    agent_id: a.agent_id,
    name: a.name,
    status: a.status,
    model: a.model,
    parent_agent_id: a.parent_agent_id,
    spawned_at: a.spawned_at,
    completed_at: a.completed_at,
  }));

  const edges = topo.edges.map((e) => ({
    from: e.from_agent_id,
    to: e.to_agent_id,
    type: e.type,
    timestamp: e.timestamp,
  }));

  return {
    swarm_id: topo.swarm_id,
    agent_count: agents.length,
    edge_count: edges.length,
    agents,
    edges,
    updated_at: topo.updated_at,
  };
}
