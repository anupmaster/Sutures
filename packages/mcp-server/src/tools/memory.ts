/**
 * Memory tools — 5 tools for inspecting agent memory hierarchies.
 *
 * 6.  get_context_window       — Agent's context window with token counts
 * 7.  get_memory_hierarchy     — 3-tier memory (STM/MTM/LTM) with pressure
 * 8.  get_shared_memory_map    — Shared memory visibility per agent + staleness
 * 9.  get_memory_traversal_path — Trace G-Memory graph traversal for a decision
 * 10. simulate_prune           — Preview Focus Agent pruning (dry run)
 */

import type { CollectorClient } from '../collector-client.js';
import type {
  AgentEvent,
  GetContextWindowInput,
  GetMemoryHierarchyInput,
  GetMemoryTraversalPathInput,
  GetSharedMemoryMapInput,
  SimulatePruneInput,
} from '../types.js';

/** Helper to produce MCP text content. */
function textContent(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text', text }] };
}

// ── get_context_window ───────────────────────────────────────────

export async function handleGetContextWindow(
  client: CollectorClient,
  args: GetContextWindowInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const events = await client.getAgentEvents(args.agent_id, 500);

  if (events.length === 0) {
    return textContent(`No events found for agent '${args.agent_id}'.`);
  }

  // Reconstruct context window from turn events
  const contextMessages: Array<{
    role: string;
    event_type: string;
    timestamp: string;
    token_count?: number;
    content_preview: string;
  }> = [];

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  for (const e of events) {
    if (
      e.event_type === 'turn.thought' ||
      e.event_type === 'turn.observed' ||
      e.event_type === 'turn.acting'
    ) {
      const role = typeof e.data['role'] === 'string'
        ? e.data['role']
        : e.event_type === 'turn.thought' ? 'assistant' : 'tool';

      const content = String(
        e.data['summary'] ?? e.data['content'] ?? e.data['thought'] ?? '',
      );
      const tokenCount = typeof e.data['token_count'] === 'number'
        ? e.data['token_count']
        : undefined;

      contextMessages.push({
        role,
        event_type: e.event_type,
        timestamp: e.timestamp,
        token_count: tokenCount,
        content_preview: content.slice(0, 300),
      });
    }

    // Aggregate token counts from cost events
    if (e.event_type === 'cost.tokens') {
      const input = e.data['input_tokens'];
      const output = e.data['output_tokens'];
      if (typeof input === 'number') totalInputTokens += input;
      if (typeof output === 'number') totalOutputTokens += output;
    }
  }

  // Look for context pressure events
  const pressureEvents = events.filter(
    (e) => e.data['context_pressure'] !== undefined || e.event_type === 'memory.prune',
  );
  const latestPressure = pressureEvents.length > 0
    ? pressureEvents[pressureEvents.length - 1].data['context_pressure']
    : undefined;

  return textContent({
    agent_id: args.agent_id,
    message_count: contextMessages.length,
    total_input_tokens: totalInputTokens,
    total_output_tokens: totalOutputTokens,
    total_tokens: totalInputTokens + totalOutputTokens,
    context_pressure: latestPressure,
    messages: contextMessages,
  });
}

// ── get_memory_hierarchy ─────────────────────────────────────────

export async function handleGetMemoryHierarchy(
  client: CollectorClient,
  args: GetMemoryHierarchyInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const events = await client.getAgentEvents(args.agent_id, 500);

  if (events.length === 0) {
    return textContent(`No events found for agent '${args.agent_id}'.`);
  }

  // Look for memory events to reconstruct tier state
  const memoryWrites = events.filter((e) => e.event_type === 'memory.write');
  const memoryReads = events.filter((e) => e.event_type === 'memory.read');
  const tierMigrations = events.filter((e) => e.event_type === 'memory.tier_migration');
  const pruneEvents = events.filter((e) => e.event_type === 'memory.prune');
  const reconsolidateEvents = events.filter((e) => e.event_type === 'memory.reconsolidate');

  // Extract tier info from events
  const stm: Array<Record<string, unknown>> = [];
  const mtm: Array<Record<string, unknown>> = [];
  const ltm: Array<Record<string, unknown>> = [];

  for (const e of memoryWrites) {
    const tier = e.data['tier'];
    const entry = {
      key: e.data['key'],
      timestamp: e.timestamp,
      size: e.data['size'],
      ttl: e.data['ttl'],
    };
    if (tier === 'stm') stm.push(entry);
    else if (tier === 'mtm') mtm.push(entry);
    else if (tier === 'ltm') ltm.push(entry);
    else stm.push(entry); // Default to STM
  }

  // Compute pressure from most recent relevant event
  let pressurePct: number | undefined;
  const allMemoryEvents = [...memoryWrites, ...pruneEvents, ...tierMigrations];
  allMemoryEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  for (let i = allMemoryEvents.length - 1; i >= 0; i--) {
    const p = allMemoryEvents[i].data['pressure_pct'];
    if (typeof p === 'number') {
      pressurePct = p;
      break;
    }
  }

  return textContent({
    agent_id: args.agent_id,
    pressure_pct: pressurePct,
    tiers: {
      stm: { entry_count: stm.length, entries: stm.slice(-20) },
      mtm: { entry_count: mtm.length, entries: mtm.slice(-20) },
      ltm: { entry_count: ltm.length, entries: ltm.slice(-20) },
    },
    stats: {
      total_writes: memoryWrites.length,
      total_reads: memoryReads.length,
      tier_migrations: tierMigrations.length,
      prune_operations: pruneEvents.length,
      reconsolidations: reconsolidateEvents.length,
    },
    recent_migrations: tierMigrations.slice(-5).map((e) => ({
      timestamp: e.timestamp,
      from_tier: e.data['from_tier'],
      to_tier: e.data['to_tier'],
      key: e.data['key'],
      reason: e.data['reason'],
    })),
  });
}

// ── get_shared_memory_map ────────────────────────────────────────

export async function handleGetSharedMemoryMap(
  client: CollectorClient,
  args: GetSharedMemoryMapInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const topologies = await client.getAllTopologies();
  const swarmIds = args.swarm_id ? [args.swarm_id] : Object.keys(topologies);

  if (swarmIds.length === 0) {
    return textContent('No active swarms found.');
  }

  const results = [];

  for (const swarmId of swarmIds) {
    const topo = topologies[swarmId];
    if (!topo) continue;

    const events = await client.getSwarmEvents(swarmId, 1000);

    // Build a map of shared memory writes and reads per agent
    const sharedKeys = new Map<string, {
      last_writer: string;
      last_write_time: string;
      readers: Map<string, string>; // agent_id -> last_read_time
      value_preview?: string;
    }>();

    for (const e of events) {
      if (e.event_type === 'memory.write' && e.data['scope'] === 'shared') {
        const key = String(e.data['key'] ?? 'unknown');
        const existing = sharedKeys.get(key);
        if (!existing || e.timestamp > existing.last_write_time) {
          sharedKeys.set(key, {
            last_writer: e.agent_id,
            last_write_time: e.timestamp,
            readers: existing?.readers ?? new Map(),
            value_preview: String(e.data['value'] ?? '').slice(0, 200),
          });
        }
      }
      if (e.event_type === 'memory.read' && e.data['scope'] === 'shared') {
        const key = String(e.data['key'] ?? 'unknown');
        const existing = sharedKeys.get(key);
        if (existing) {
          existing.readers.set(e.agent_id, e.timestamp);
        }
      }
    }

    // Convert to serializable format with staleness
    const sharedMemory = Array.from(sharedKeys.entries()).map(([key, info]) => {
      const readers = Array.from(info.readers.entries()).map(([agentId, readTime]) => ({
        agent_id: agentId,
        last_read_time: readTime,
        stale: readTime < info.last_write_time,
      }));

      return {
        key,
        last_writer: info.last_writer,
        last_write_time: info.last_write_time,
        value_preview: info.value_preview,
        readers,
        stale_reader_count: readers.filter((r) => r.stale).length,
      };
    });

    // Conflict events
    const conflicts = events
      .filter((e) => e.event_type === 'memory.conflict')
      .map((e) => ({
        timestamp: e.timestamp,
        key: e.data['key'],
        agents: e.data['conflicting_agents'],
        resolution: e.data['resolution'],
      }));

    results.push({
      swarm_id: swarmId,
      shared_key_count: sharedMemory.length,
      shared_memory: sharedMemory,
      conflict_count: conflicts.length,
      recent_conflicts: conflicts.slice(-5),
    });
  }

  if (results.length === 1) {
    return textContent(results[0]);
  }
  return textContent({ swarm_count: results.length, swarms: results });
}

// ── get_memory_traversal_path ────────────────────────────────────

export async function handleGetMemoryTraversalPath(
  client: CollectorClient,
  args: GetMemoryTraversalPathInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const events = await client.getAgentEvents(args.agent_id, 500);

  if (events.length === 0) {
    return textContent(`No events found for agent '${args.agent_id}'.`);
  }

  // Find the target decision event
  const targetEvent = events.find((e) => e.event_id === args.decision_event_id);
  if (!targetEvent) {
    return textContent(
      `Decision event '${args.decision_event_id}' not found for agent '${args.agent_id}'.`,
    );
  }

  // Find all memory reads that preceded this decision
  const targetTime = new Date(targetEvent.timestamp).getTime();
  const precedingReads = events.filter(
    (e) =>
      e.event_type === 'memory.read' &&
      new Date(e.timestamp).getTime() <= targetTime,
  );

  // Build traversal path
  const traversalPath = precedingReads.map((e) => ({
    timestamp: e.timestamp,
    key: e.data['key'],
    tier: e.data['tier'],
    scope: e.data['scope'],
    traversal_hops: e.data['traversal_hops'],
    linked_nodes: e.data['linked_nodes'],
    relevance_score: e.data['relevance_score'],
  }));

  // Find any structure switches near the decision
  const structureSwitches = events.filter(
    (e) =>
      e.event_type === 'memory.structure_switch' &&
      Math.abs(new Date(e.timestamp).getTime() - targetTime) < 60_000,
  );

  return textContent({
    agent_id: args.agent_id,
    decision_event: {
      event_id: targetEvent.event_id,
      event_type: targetEvent.event_type,
      timestamp: targetEvent.timestamp,
    },
    traversal_path: traversalPath,
    memory_reads_count: precedingReads.length,
    structure_switches_near_decision: structureSwitches.map((e) => ({
      timestamp: e.timestamp,
      from_structure: e.data['from_structure'],
      to_structure: e.data['to_structure'],
      reason: e.data['reason'],
    })),
  });
}

// ── simulate_prune ───────────────────────────────────────────────

export async function handleSimulatePrune(
  client: CollectorClient,
  args: SimulatePruneInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const events = await client.getAgentEvents(args.agent_id, 500);

  if (events.length === 0) {
    return textContent(`No events found for agent '${args.agent_id}'.`);
  }

  const strategy = args.strategy ?? 'focus_agent';
  const threshold = args.threshold ?? 0.7; // 70% context pressure

  // Collect context window messages
  const contextMessages = events.filter(
    (e) =>
      e.event_type === 'turn.thought' ||
      e.event_type === 'turn.observed' ||
      e.event_type === 'turn.acting',
  );

  // Simulate pruning based on strategy
  const wouldPrune: Array<{
    event_id: string;
    event_type: string;
    timestamp: string;
    reason: string;
    token_count?: number;
  }> = [];

  const wouldKeep: Array<{
    event_id: string;
    event_type: string;
    timestamp: string;
    reason: string;
  }> = [];

  if (strategy === 'focus_agent') {
    // Focus Agent pruning: keep recent, keep high-relevance, prune old low-relevance
    const midpoint = Math.floor(contextMessages.length * threshold);

    for (let i = 0; i < contextMessages.length; i++) {
      const e = contextMessages[i];
      const relevance = typeof e.data['relevance_score'] === 'number'
        ? e.data['relevance_score']
        : undefined;

      if (i < midpoint && (relevance === undefined || relevance < 0.5)) {
        wouldPrune.push({
          event_id: e.event_id,
          event_type: e.event_type,
          timestamp: e.timestamp,
          reason: 'Old message with low relevance score',
          token_count: typeof e.data['token_count'] === 'number' ? e.data['token_count'] : undefined,
        });
      } else {
        wouldKeep.push({
          event_id: e.event_id,
          event_type: e.event_type,
          timestamp: e.timestamp,
          reason: i >= midpoint ? 'Recent message' : 'High relevance score',
        });
      }
    }
  } else {
    // Generic FIFO pruning
    const pruneCount = Math.floor(contextMessages.length * (1 - threshold));
    for (let i = 0; i < contextMessages.length; i++) {
      const e = contextMessages[i];
      if (i < pruneCount) {
        wouldPrune.push({
          event_id: e.event_id,
          event_type: e.event_type,
          timestamp: e.timestamp,
          reason: 'FIFO: oldest messages removed first',
          token_count: typeof e.data['token_count'] === 'number' ? e.data['token_count'] : undefined,
        });
      } else {
        wouldKeep.push({
          event_id: e.event_id,
          event_type: e.event_type,
          timestamp: e.timestamp,
          reason: 'Within retention window',
        });
      }
    }
  }

  const tokensSaved = wouldPrune.reduce(
    (sum, m) => sum + (m.token_count ?? 0),
    0,
  );

  return textContent({
    agent_id: args.agent_id,
    strategy,
    threshold,
    dry_run: true,
    total_messages: contextMessages.length,
    would_prune_count: wouldPrune.length,
    would_keep_count: wouldKeep.length,
    estimated_tokens_saved: tokensSaved,
    would_prune: wouldPrune.slice(0, 20),
    would_keep_summary: {
      count: wouldKeep.length,
      oldest: wouldKeep[0]?.timestamp,
      newest: wouldKeep[wouldKeep.length - 1]?.timestamp,
    },
  });
}
