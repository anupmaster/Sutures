/**
 * Breakpoint tools — 5 tools for setting, releasing, and managing breakpoints.
 *
 * 11. set_breakpoint       — Set a conditional breakpoint (13 conditions)
 * 12. release_breakpoint   — Remove a breakpoint by ID
 * 13. inject_and_resume    — Inject modified state and resume a paused agent
 * 14. get_checkpoints      — List available checkpoints for time-travel
 * 15. fork_from_checkpoint — Fork execution from a past checkpoint
 */

import type { CollectorClient } from '../collector-client.js';
import type {
  ForkFromCheckpointInput,
  GetCheckpointsInput,
  InjectAndResumeInput,
  ReleaseBreakpointInput,
  SetBreakpointInput,
} from '../types.js';

/** Helper to produce MCP text content. */
function textContent(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text', text }] };
}

// ── set_breakpoint ───────────────────────────────────────────────

export async function handleSetBreakpoint(
  client: CollectorClient,
  args: SetBreakpointInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const payload: Record<string, unknown> = {
    condition: args.condition,
  };

  if (args.agent_id) {
    payload['agent_id'] = args.agent_id;
  }

  // Map condition-specific params into the breakpoint value field
  if (args.params) {
    payload['value'] = args.params;

    // Also pass specific well-known fields at the top level for the controller
    if (args.params['tool_name'] !== undefined) {
      payload['tool_name'] = args.params['tool_name'];
    }
    if (args.params['max_usd'] !== undefined) {
      payload['max_usd'] = args.params['max_usd'];
    }
    if (args.params['threshold'] !== undefined) {
      payload['threshold'] = args.params['threshold'];
    }
    if (args.params['turn_number'] !== undefined) {
      payload['turn_number'] = args.params['turn_number'];
    }
    if (args.params['once'] !== undefined) {
      payload['once'] = args.params['once'];
    }
    if (args.params['swarm_id'] !== undefined) {
      payload['swarm_id'] = args.params['swarm_id'];
    }
  }

  const result = await client.sendCommand('set_breakpoint', payload);

  if (result['error']) {
    return textContent(`Failed to set breakpoint: ${result['error']}`);
  }

  const conditionDescription = describeCondition(args.condition, args.params);

  return textContent({
    success: true,
    breakpoint_id: result['breakpoint_id'],
    condition: args.condition,
    agent_id: args.agent_id ?? '*',
    description: conditionDescription,
    message: `Breakpoint set. The agent will pause when: ${conditionDescription}`,
  });
}

// ── release_breakpoint ───────────────────────────────────────────

export async function handleReleaseBreakpoint(
  client: CollectorClient,
  args: ReleaseBreakpointInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const result = await client.sendCommand('release_breakpoint', {
    breakpoint_id: args.breakpoint_id,
  });

  if (result['error']) {
    return textContent(`Failed to release breakpoint: ${result['error']}`);
  }

  const removed = result['removed'] === true;
  return textContent({
    success: removed,
    breakpoint_id: args.breakpoint_id,
    message: removed
      ? `Breakpoint '${args.breakpoint_id}' removed successfully.`
      : `Breakpoint '${args.breakpoint_id}' was not found (may have already been removed).`,
  });
}

// ── inject_and_resume ────────────────────────────────────────────

export async function handleInjectAndResume(
  client: CollectorClient,
  args: InjectAndResumeInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const payload: Record<string, unknown> = {
    agent_id: args.agent_id,
  };

  // Build the injection based on type and channel
  if (args.injection_type === 'append' && args.channel === 'messages') {
    payload['messages'] = Array.isArray(args.content) ? args.content : [args.content];
  } else if (args.injection_type === 'replace' && args.channel === 'messages') {
    payload['messages'] = Array.isArray(args.content) ? args.content : [args.content];
    payload['replace'] = true;
  } else if (args.channel === 'memory') {
    payload['state'] = { memory: args.content };
  } else {
    payload['state'] = { [args.channel]: args.content };
  }

  const result = await client.sendCommand('inject_and_resume', payload);

  if (result['error']) {
    return textContent(`Failed to inject and resume: ${result['error']}`);
  }

  return textContent({
    success: true,
    event_id: result['event_id'],
    agent_id: args.agent_id,
    injection_type: args.injection_type,
    channel: args.channel,
    message: `Agent '${args.agent_id}' has been injected with modified ${args.channel} (${args.injection_type}) and resumed.`,
  });
}

// ── get_checkpoints ──────────────────────────────────────────────

export async function handleGetCheckpoints(
  client: CollectorClient,
  args: GetCheckpointsInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const resp = await client.getCheckpoints(args.thread_id);

  if (resp.checkpoints.length === 0) {
    return textContent(
      `No checkpoints found for thread '${args.thread_id}'. ` +
      'Checkpoints are created automatically at key state transitions.',
    );
  }

  const checkpoints = resp.checkpoints.map((cp) => ({
    checkpoint_id: cp.checkpoint_id,
    agent_id: cp.agent_id,
    swarm_id: cp.swarm_id,
    created_at: cp.created_at,
    parent_checkpoint_id: cp.parent_checkpoint_id,
    has_state: cp.state !== undefined && cp.state !== null,
    has_memory_hierarchy: cp.memory_hierarchy !== undefined && cp.memory_hierarchy !== null,
  }));

  return textContent({
    thread_id: args.thread_id,
    checkpoint_count: checkpoints.length,
    checkpoints,
  });
}

// ── fork_from_checkpoint ─────────────────────────────────────────

export async function handleForkFromCheckpoint(
  client: CollectorClient,
  args: ForkFromCheckpointInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const payload: Record<string, unknown> = {
    checkpoint_id: args.checkpoint_id,
  };

  if (args.updates) {
    payload['updates'] = args.updates;
  }

  const result = await client.sendCommand('fork_from_checkpoint', payload);

  if (result['error']) {
    return textContent(`Failed to fork from checkpoint: ${result['error']}`);
  }

  const checkpoint = result['checkpoint'] as Record<string, unknown> | undefined;

  return textContent({
    success: true,
    original_checkpoint_id: args.checkpoint_id,
    forked_checkpoint_id: checkpoint?.['checkpoint_id'],
    agent_id: checkpoint?.['agent_id'],
    swarm_id: checkpoint?.['swarm_id'],
    updates_applied: args.updates !== undefined,
    message: `Forked execution from checkpoint '${args.checkpoint_id}'. ` +
      `New checkpoint: '${checkpoint?.['checkpoint_id'] ?? 'unknown'}'.`,
  });
}

// ── Helpers ──────────────────────────────────────────────────────

function describeCondition(
  condition: string,
  params?: Record<string, unknown>,
): string {
  switch (condition) {
    case 'always':
      return 'Every event (unconditional)';
    case 'on_turn':
      return params?.['turn_number'] !== undefined
        ? `Turn ${params['turn_number']} is reached`
        : 'Any turn completes';
    case 'on_tool':
      return params?.['tool_name']
        ? `Tool '${params['tool_name']}' is called`
        : 'Any tool is called';
    case 'on_handoff':
      return 'An agent handoff occurs';
    case 'on_cost':
      return params?.['max_usd'] !== undefined
        ? `Cost exceeds $${params['max_usd']}`
        : 'Any cost event occurs';
    case 'on_error':
      return 'An error or failure occurs';
    case 'on_score':
      return params?.['threshold'] !== undefined
        ? `Score drops below ${params['threshold']}`
        : 'A score event occurs';
    case 'on_memory_tier_migration':
      return 'Memory tier migration occurs (STM/MTM/LTM)';
    case 'on_conflict_detected':
      return 'A shared memory conflict is detected';
    case 'on_context_pressure':
      return params?.['threshold'] !== undefined
        ? `Context pressure exceeds ${Number(params['threshold']) * 100}%`
        : 'Context pressure is high';
    case 'on_memory_structure_switch':
      return 'Memory structure switches (e.g., list to graph)';
    case 'on_memory_link_created':
      return 'A new memory link is created in G-Memory';
    case 'on_cache_coherence_violation':
      return 'A cache coherence violation is detected';
    default:
      return `Condition: ${condition}`;
  }
}
