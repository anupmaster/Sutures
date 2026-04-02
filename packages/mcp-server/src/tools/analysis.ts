/**
 * Analysis tools — 3 tools for root cause analysis, cost breakdown, and trace export.
 *
 * 16. get_root_cause    — Trace-based root cause analysis of a failure
 * 17. get_cost_breakdown — Detailed cost breakdown by agent, model, and turn
 * 18. export_trace      — Export the current trace as JSON for sharing/replay
 */

import type { CollectorClient } from '../collector-client.js';
import type {
  AgentEvent,
  ExportTestFixtureInput,
  ExportTraceInput,
  GetCostBreakdownInput,
  GetRootCauseInput,
} from '../types.js';

/** Helper to produce MCP text content. */
function textContent(data: unknown): { content: Array<{ type: 'text'; text: string }> } {
  const text = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  return { content: [{ type: 'text', text }] };
}

// ── get_root_cause ───────────────────────────────────────────────

export async function handleGetRootCause(
  client: CollectorClient,
  args: GetRootCauseInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  // Fetch events based on provided filters
  let events: AgentEvent[];
  if (args.agent_id) {
    events = await client.getAgentEvents(args.agent_id, 500);
  } else if (args.swarm_id) {
    events = await client.getSwarmEvents(args.swarm_id, 1000);
  } else {
    const resp = await client.getEvents({ limit: 500 });
    events = resp.events;
  }

  if (events.length === 0) {
    return textContent('No events found. Cannot perform root cause analysis.');
  }

  // Find the target error event
  let errorEvent: AgentEvent | undefined;
  if (args.error_event_id) {
    errorEvent = events.find((e) => e.event_id === args.error_event_id);
  }
  if (!errorEvent) {
    // Find the most recent error/failure
    errorEvent = [...events]
      .reverse()
      .find(
        (e) =>
          e.event_type === 'agent.failed' ||
          e.event_type === 'turn.failed' ||
          e.severity === 'error' ||
          e.severity === 'critical',
      );
  }

  if (!errorEvent) {
    return textContent('No errors found in the event trace. All agents appear healthy.');
  }

  // Analyze the trace leading to the error
  const errorTime = new Date(errorEvent.timestamp).getTime();
  const precedingEvents = events.filter(
    (e) =>
      e.agent_id === errorEvent.agent_id &&
      new Date(e.timestamp).getTime() <= errorTime,
  );

  // Sort chronologically
  precedingEvents.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  // Build causal chain
  const causalChain: Array<{
    event_id: string;
    event_type: string;
    timestamp: string;
    severity: string;
    summary: string;
  }> = [];

  for (const e of precedingEvents.slice(-30)) {
    causalChain.push({
      event_id: e.event_id,
      event_type: e.event_type,
      timestamp: e.timestamp,
      severity: e.severity,
      summary: buildEventSummary(e),
    });
  }

  // Identify contributing factors
  const contributingFactors: string[] = [];

  // Check for repeated failures
  const failureCount = precedingEvents.filter(
    (e) => e.event_type === 'turn.failed',
  ).length;
  if (failureCount > 1) {
    contributingFactors.push(
      `Repeated failures: ${failureCount} turn failures before the final error`,
    );
  }

  // Check for context pressure
  const pressureEvents = precedingEvents.filter(
    (e) => typeof e.data['context_pressure'] === 'number' && (e.data['context_pressure'] as number) > 0.8,
  );
  if (pressureEvents.length > 0) {
    contributingFactors.push(
      `High context pressure detected (>${80}%) in ${pressureEvents.length} events`,
    );
  }

  // Check for handoff issues
  const rejectedHandoffs = precedingEvents.filter(
    (e) => e.event_type === 'handoff.rejected',
  );
  if (rejectedHandoffs.length > 0) {
    contributingFactors.push(
      `${rejectedHandoffs.length} rejected handoff(s) before the failure`,
    );
  }

  // Check for cost spikes
  const costEvents = precedingEvents.filter(
    (e) => e.event_type === 'cost.tokens' || e.event_type === 'cost.api_call',
  );
  const totalCost = costEvents.reduce((sum, e) => {
    const cost = e.data['cost_usd'];
    return sum + (typeof cost === 'number' ? cost : 0);
  }, 0);
  if (totalCost > 1.0) {
    contributingFactors.push(
      `High cost accumulated before failure: $${totalCost.toFixed(4)}`,
    );
  }

  // Check for memory conflicts
  const memoryConflicts = precedingEvents.filter(
    (e) => e.event_type === 'memory.conflict',
  );
  if (memoryConflicts.length > 0) {
    contributingFactors.push(
      `${memoryConflicts.length} memory conflict(s) detected before the failure`,
    );
  }

  // Check for anomaly patterns (infinite loop, rapid tool calls)
  const toolCalls = precedingEvents.filter((e) => e.event_type === 'turn.acting');
  if (toolCalls.length > 20) {
    // Check for repeated tool calls
    const toolNames = toolCalls.map((e) => String(e.data['tool_name'] ?? ''));
    const toolFreq = new Map<string, number>();
    for (const name of toolNames) {
      toolFreq.set(name, (toolFreq.get(name) ?? 0) + 1);
    }
    for (const [name, count] of toolFreq) {
      if (count > 10) {
        contributingFactors.push(
          `Possible infinite loop: tool '${name}' called ${count} times`,
        );
      }
    }
  }

  // Build the root cause summary
  const errorMessage = String(
    errorEvent.data['error'] ?? errorEvent.data['message'] ?? errorEvent.data['reason'] ?? 'Unknown error',
  );

  const rootCauseSummary = buildRootCauseSummary(errorEvent, contributingFactors);

  return textContent({
    root_cause: {
      error_event_id: errorEvent.event_id,
      agent_id: errorEvent.agent_id,
      swarm_id: errorEvent.swarm_id,
      event_type: errorEvent.event_type,
      timestamp: errorEvent.timestamp,
      error_message: errorMessage,
      error_code: errorEvent.data['error_code'],
      stack_trace: errorEvent.data['stack_trace'],
    },
    summary: rootCauseSummary,
    contributing_factors: contributingFactors,
    causal_chain: causalChain,
    recommendation: buildRecommendation(errorEvent, contributingFactors),
  });
}

// ── get_cost_breakdown ───────────────────────────────────────────

export async function handleGetCostBreakdown(
  client: CollectorClient,
  args: GetCostBreakdownInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const topologies = await client.getAllTopologies();
  const swarmIds = args.swarm_id ? [args.swarm_id] : Object.keys(topologies);

  if (swarmIds.length === 0) {
    return textContent('No active swarms found.');
  }

  const breakdowns = [];

  for (const swarmId of swarmIds) {
    const events = await client.getSwarmEvents(swarmId, 1000);

    const costEvents = events.filter(
      (e) => e.event_type === 'cost.tokens' || e.event_type === 'cost.api_call',
    );

    if (costEvents.length === 0) {
      breakdowns.push({
        swarm_id: swarmId,
        total_cost_usd: 0,
        message: 'No cost events recorded for this swarm.',
      });
      continue;
    }

    // By agent
    const byAgent = new Map<string, {
      cost_usd: number;
      input_tokens: number;
      output_tokens: number;
      api_calls: number;
    }>();

    // By model
    const byModel = new Map<string, {
      cost_usd: number;
      input_tokens: number;
      output_tokens: number;
      api_calls: number;
    }>();

    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalApiCalls = 0;

    for (const e of costEvents) {
      const cost = typeof e.data['cost_usd'] === 'number' ? e.data['cost_usd'] : 0;
      const inputTokens = typeof e.data['input_tokens'] === 'number' ? e.data['input_tokens'] : 0;
      const outputTokens = typeof e.data['output_tokens'] === 'number' ? e.data['output_tokens'] : 0;
      const model = typeof e.data['model'] === 'string' ? e.data['model'] : 'unknown';
      const isApiCall = e.event_type === 'cost.api_call' ? 1 : 0;

      totalCost += cost;
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      totalApiCalls += isApiCall;

      // Accumulate by agent
      const agentEntry = byAgent.get(e.agent_id) ?? {
        cost_usd: 0, input_tokens: 0, output_tokens: 0, api_calls: 0,
      };
      agentEntry.cost_usd += cost;
      agentEntry.input_tokens += inputTokens;
      agentEntry.output_tokens += outputTokens;
      agentEntry.api_calls += isApiCall;
      byAgent.set(e.agent_id, agentEntry);

      // Accumulate by model
      const modelEntry = byModel.get(model) ?? {
        cost_usd: 0, input_tokens: 0, output_tokens: 0, api_calls: 0,
      };
      modelEntry.cost_usd += cost;
      modelEntry.input_tokens += inputTokens;
      modelEntry.output_tokens += outputTokens;
      modelEntry.api_calls += isApiCall;
      byModel.set(model, modelEntry);
    }

    // Per-turn cost (turns = completed turns)
    const turnCount = events.filter((e) => e.event_type === 'turn.completed').length;
    const costPerTurn = turnCount > 0 ? totalCost / turnCount : 0;

    // Convert maps to sorted arrays
    const agentBreakdown = Array.from(byAgent.entries())
      .map(([agentId, data]) => ({ agent_id: agentId, ...data }))
      .sort((a, b) => b.cost_usd - a.cost_usd);

    const modelBreakdown = Array.from(byModel.entries())
      .map(([model, data]) => ({ model, ...data }))
      .sort((a, b) => b.cost_usd - a.cost_usd);

    breakdowns.push({
      swarm_id: swarmId,
      total_cost_usd: roundCost(totalCost),
      total_input_tokens: totalInputTokens,
      total_output_tokens: totalOutputTokens,
      total_api_calls: totalApiCalls,
      cost_per_turn_usd: roundCost(costPerTurn),
      total_turns: turnCount,
      by_agent: agentBreakdown.map((a) => ({
        ...a,
        cost_usd: roundCost(a.cost_usd),
        pct_of_total: totalCost > 0 ? roundPct(a.cost_usd / totalCost) : 0,
      })),
      by_model: modelBreakdown.map((m) => ({
        ...m,
        cost_usd: roundCost(m.cost_usd),
        pct_of_total: totalCost > 0 ? roundPct(m.cost_usd / totalCost) : 0,
      })),
    });
  }

  if (breakdowns.length === 1) {
    return textContent(breakdowns[0]);
  }
  return textContent({ swarm_count: breakdowns.length, breakdowns });
}

// ── export_trace ─────────────────────────────────────────────────

export async function handleExportTrace(
  client: CollectorClient,
  args: ExportTraceInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const limit = args.limit ?? 1000;

  let events: AgentEvent[];
  if (args.agent_id) {
    events = await client.getAgentEvents(args.agent_id, limit);
  } else if (args.swarm_id) {
    events = await client.getSwarmEvents(args.swarm_id, limit);
  } else {
    const resp = await client.getEvents({ limit });
    events = resp.events;
  }

  if (events.length === 0) {
    return textContent('No events to export.');
  }

  // Build topology snapshot
  const topologies = await client.getAllTopologies();
  const relevantTopologies: Record<string, unknown> = {};
  const swarmIds = new Set(events.map((e) => e.swarm_id));
  for (const sid of swarmIds) {
    if (topologies[sid]) {
      relevantTopologies[sid] = topologies[sid];
    }
  }

  const trace = {
    export_version: '1.0.0',
    exported_at: new Date().toISOString(),
    filters: {
      swarm_id: args.swarm_id ?? null,
      agent_id: args.agent_id ?? null,
      limit,
    },
    summary: {
      event_count: events.length,
      swarm_count: swarmIds.size,
      agent_count: new Set(events.map((e) => e.agent_id)).size,
      time_range: {
        earliest: events[0]?.timestamp,
        latest: events[events.length - 1]?.timestamp,
      },
      event_types: countByField(events, 'event_type'),
    },
    topologies: relevantTopologies,
    events,
  };

  return textContent(trace);
}

// ── export_test_fixture ─────────────────────────────────────────

export async function handleExportTestFixture(
  client: CollectorClient,
  args: ExportTestFixtureInput,
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const limit = 1000;

  let events: AgentEvent[];
  if (args.agent_id) {
    events = await client.getAgentEvents(args.agent_id, limit);
  } else if (args.swarm_id) {
    events = await client.getSwarmEvents(args.swarm_id, limit);
  } else {
    const resp = await client.getEvents({ limit });
    events = resp.events;
  }

  if (events.length === 0) {
    return textContent('No events found. Cannot generate test fixture.');
  }

  // Build topology snapshot
  const topologies = await client.getAllTopologies();
  const relevantTopologies: Record<string, unknown> = {};
  const swarmIds = new Set(events.map((e) => e.swarm_id));
  for (const sid of swarmIds) {
    if (topologies[sid]) {
      relevantTopologies[sid] = topologies[sid];
    }
  }

  // Derive assertions from events
  const agentIds = new Set(events.map((e) => e.agent_id));
  const toolCalls = events
    .filter((e) => e.event_type === 'turn.acting')
    .map((e) => String(e.data['tool_name'] ?? ''));
  const handoffs = events
    .filter((e) => e.event_type === 'handoff.initiated')
    .map((e) => `${e.data['source_agent_id']}->${e.data['target_agent_id']}`);
  const costEvents = events.filter((e) => e.event_type === 'cost.tokens');
  const totalCost = costEvents.reduce((sum, e) => {
    const cost = e.data['cost_usd'];
    return sum + (typeof cost === 'number' ? cost : 0);
  }, 0);
  const errorCount = events.filter(
    (e) => e.severity === 'error' || e.severity === 'critical',
  ).length;

  // Cost tolerance: 10% range around observed cost (floor at 0)
  const costMin = Math.max(0, roundCost(totalCost * 0.9));
  const costMax = roundCost(totalCost * 1.1);

  const swarmId = args.swarm_id ?? [...swarmIds][0] ?? 'unknown';

  const fixture = {
    version: '1.0.0',
    swarm_id: swarmId,
    captured_at: new Date().toISOString(),
    topologies: relevantTopologies,
    events,
    assertions: {
      agent_count: agentIds.size,
      tool_calls: toolCalls,
      handoff_chain: handoffs,
      total_cost_range: { min: costMin, max: costMax },
      error_count: errorCount,
    },
  };

  const fixtureFileName = args.output_path
    ? args.output_path.replace(/\.[^.]+$/, '') + '.json'
    : `fixture_${swarmId}.json`;

  const testCode =
    args.format === 'pytest'
      ? generatePytestCode(fixtureFileName)
      : generateVitestCode(fixtureFileName);

  const testFileName =
    args.format === 'pytest'
      ? fixtureFileName.replace('.json', '_test.py')
      : fixtureFileName.replace('.json', '.test.ts');

  return textContent({
    fixture,
    testCode,
    metadata: {
      format: args.format,
      fixture_file: fixtureFileName,
      test_file: testFileName,
      event_count: events.length,
      assertion_summary: {
        agents: agentIds.size,
        tool_calls: toolCalls.length,
        handoffs: handoffs.length,
        total_cost_usd: roundCost(totalCost),
        errors: errorCount,
      },
    },
  });
}

function generatePytestCode(fixtureFile: string): string {
  const d = '$';
  const lines = [
    '"""',
    'Auto-generated trace-to-test fixture.',
    'Replays a captured Sutures event trace and verifies agent behavior.',
    '',
    'Generated by: Sutures export_test_fixture',
    '"""',
    '',
    'import json',
    'import pathlib',
    '',
    'import pytest',
    '',
    '',
    '@pytest.fixture',
    'def trace_fixture():',
    '    fixture_path = pathlib.Path(__file__).parent / "' + fixtureFile + '"',
    '    with open(fixture_path) as f:',
    '        return json.load(f)',
    '',
    '',
    'def test_agent_count(trace_fixture):',
    '    """Verify the expected number of unique agents participated."""',
    '    agent_ids = {e["agent_id"] for e in trace_fixture["events"]}',
    '    assert len(agent_ids) == trace_fixture["assertions"]["agent_count"]',
    '',
    '',
    'def test_tool_call_sequence(trace_fixture):',
    '    """Verify tool calls happen in the expected order."""',
    '    tool_calls = [',
    '        e for e in trace_fixture["events"] if e["event_type"] == "turn.acting"',
    '    ]',
    '    expected = trace_fixture["assertions"]["tool_calls"]',
    '    actual = [e["data"]["tool_name"] for e in tool_calls]',
    '    assert actual == expected, f"Tool call sequence mismatch: {actual} != {expected}"',
    '',
    '',
    'def test_handoff_chain(trace_fixture):',
    '    """Verify handoffs happen between the expected agent pairs in order."""',
    '    handoffs = [',
    '        e for e in trace_fixture["events"] if e["event_type"] == "handoff.initiated"',
    '    ]',
    '    expected = trace_fixture["assertions"]["handoff_chain"]',
    '    actual = [',
    '        f"{e[\'data\'][\'source_agent_id\']}->{e[\'data\'][\'target_agent_id\']}"',
    '        for e in handoffs',
    '    ]',
    '    assert actual == expected, f"Handoff chain mismatch: {actual} != {expected}"',
    '',
    '',
    'def test_no_unexpected_errors(trace_fixture):',
    '    """Verify error count matches the expected baseline."""',
    '    errors = [',
    '        e',
    '        for e in trace_fixture["events"]',
    '        if e.get("severity") in ("error", "critical")',
    '    ]',
    '    assert len(errors) == trace_fixture["assertions"]["error_count"], (',
    '        f"Expected {trace_fixture[\'assertions\'][\'error_count\']} errors, got {len(errors)}"',
    '    )',
    '',
    '',
    'def test_cost_within_range(trace_fixture):',
    '    """Verify total cost stays within 10% tolerance of the captured run."""',
    '    cost_events = [',
    '        e for e in trace_fixture["events"] if e["event_type"] == "cost.tokens"',
    '    ]',
    '    total = sum(e["data"].get("cost_usd", 0) for e in cost_events)',
    '    r = trace_fixture["assertions"]["total_cost_range"]',
    '    assert r["min"] <= total <= r["max"], (',
    '        f"Total cost ' + d + '{total:.6f} outside range [' + d + '{r[\'min\']:.6f}, ' + d + '{r[\'max\']:.6f}]"',
    '    )',
    '',
  ];
  return lines.join('\n');
}

function generateVitestCode(fixtureFile: string): string {
  const bt = '`';
  const ds = '${';
  const lines = [
    '/**',
    ' * Auto-generated trace-to-test fixture.',
    ' * Replays a captured Sutures event trace and verifies agent behavior.',
    ' *',
    ' * Generated by: Sutures export_test_fixture',
    ' */',
    '',
    "import { describe, expect, it } from 'vitest';",
    "import fixture from './" + fixtureFile + "';",
    '',
    'interface TraceEvent {',
    '  event_id: string;',
    '  swarm_id: string;',
    '  agent_id: string;',
    '  timestamp: string;',
    '  event_type: string;',
    '  severity: string;',
    '  data: Record<string, unknown>;',
    '}',
    '',
    'interface TraceFixture {',
    '  version: string;',
    '  swarm_id: string;',
    '  captured_at: string;',
    '  events: TraceEvent[];',
    '  assertions: {',
    '    agent_count: number;',
    '    tool_calls: string[];',
    '    handoff_chain: string[];',
    '    total_cost_range: { min: number; max: number };',
    '    error_count: number;',
    '  };',
    '}',
    '',
    'const trace = fixture as TraceFixture;',
    '',
    "describe('Trace replay: ' + trace.swarm_id, () => {",
    "  it('should have the expected number of agents', () => {",
    '    const agentIds = new Set(trace.events.map((e) => e.agent_id));',
    '    expect(agentIds.size).toBe(trace.assertions.agent_count);',
    '  });',
    '',
    "  it('should execute tool calls in the expected order', () => {",
    '    const toolCalls = trace.events',
    "      .filter((e) => e.event_type === 'turn.acting')",
    "      .map((e) => String(e.data['tool_name']));",
    '    expect(toolCalls).toEqual(trace.assertions.tool_calls);',
    '  });',
    '',
    "  it('should follow the expected handoff chain', () => {",
    '    const handoffs = trace.events',
    "      .filter((e) => e.event_type === 'handoff.initiated')",
    "      .map((e) => " + bt + ds + "e.data['source_agent_id']}->" + ds + "e.data['target_agent_id']}" + bt + ");",
    '    expect(handoffs).toEqual(trace.assertions.handoff_chain);',
    '  });',
    '',
    "  it('should not have unexpected errors', () => {",
    '    const errors = trace.events.filter(',
    "      (e) => e.severity === 'error' || e.severity === 'critical',",
    '    );',
    '    expect(errors).toHaveLength(trace.assertions.error_count);',
    '  });',
    '',
    "  it('should keep cost within 10% tolerance', () => {",
    '    const costEvents = trace.events.filter(',
    "      (e) => e.event_type === 'cost.tokens',",
    '    );',
    '    const total = costEvents.reduce(',
    "      (sum, e) => sum + (typeof e.data['cost_usd'] === 'number' ? (e.data['cost_usd'] as number) : 0),",
    '      0,',
    '    );',
    '    const range = trace.assertions.total_cost_range;',
    '    expect(total).toBeGreaterThanOrEqual(range.min);',
    '    expect(total).toBeLessThanOrEqual(range.max);',
    '  });',
    '});',
    '',
  ];
  return lines.join('\n');
}

// ── Helpers ──────────────────────────────────────────────────────

function buildEventSummary(event: AgentEvent): string {
  const data = event.data;
  switch (event.event_type) {
    case 'agent.spawned':
      return `Agent spawned: ${data['name'] ?? event.agent_id} (model: ${data['model'] ?? 'unknown'})`;
    case 'agent.completed':
      return `Agent completed`;
    case 'agent.failed':
      return `Agent failed: ${data['error'] ?? data['message'] ?? 'unknown error'}`;
    case 'turn.started':
      return `Turn ${data['turn_number'] ?? '?'} started`;
    case 'turn.thinking':
      return `Thinking...`;
    case 'turn.thought':
      return `Thought: ${String(data['summary'] ?? data['thought'] ?? '').slice(0, 150)}`;
    case 'turn.acting':
      return `Tool call: ${data['tool_name'] ?? 'unknown'}`;
    case 'turn.observed':
      return `Observation: ${String(data['summary'] ?? '').slice(0, 150)}`;
    case 'turn.completed':
      return `Turn ${data['turn_number'] ?? '?'} completed`;
    case 'turn.failed':
      return `Turn failed: ${data['error'] ?? data['message'] ?? 'unknown'}`;
    case 'handoff.initiated':
      return `Handoff to ${data['target_agent_id'] ?? 'unknown'}`;
    case 'handoff.rejected':
      return `Handoff rejected: ${data['reason'] ?? 'unknown reason'}`;
    case 'memory.conflict':
      return `Memory conflict on key '${data['key'] ?? 'unknown'}'`;
    case 'cost.tokens':
      return `Tokens: ${data['input_tokens'] ?? 0} in / ${data['output_tokens'] ?? 0} out ($${data['cost_usd'] ?? 0})`;
    default:
      return event.event_type;
  }
}

function buildRootCauseSummary(
  errorEvent: AgentEvent,
  factors: string[],
): string {
  const errorMsg = String(
    errorEvent.data['error'] ?? errorEvent.data['message'] ?? 'Unknown error',
  );
  const parts = [
    `Agent '${errorEvent.agent_id}' experienced a ${errorEvent.event_type} at ${errorEvent.timestamp}.`,
    `Error: ${errorMsg}`,
  ];

  if (factors.length > 0) {
    parts.push(`Contributing factors: ${factors.join('; ')}.`);
  }

  return parts.join(' ');
}

function buildRecommendation(
  errorEvent: AgentEvent,
  factors: string[],
): string {
  const recommendations: string[] = [];

  if (factors.some((f) => f.includes('infinite loop'))) {
    recommendations.push(
      'Set an on_turn breakpoint to limit iterations, or add an on_tool breakpoint for the repeating tool.',
    );
  }
  if (factors.some((f) => f.includes('context pressure'))) {
    recommendations.push(
      'Consider enabling memory pruning or increasing the context window limit.',
    );
  }
  if (factors.some((f) => f.includes('memory conflict'))) {
    recommendations.push(
      'Review shared memory access patterns. Consider adding write locks or conflict resolution logic.',
    );
  }
  if (factors.some((f) => f.includes('rejected handoff'))) {
    recommendations.push(
      'Check agent capabilities and handoff conditions. The target agent may not accept this type of task.',
    );
  }
  if (factors.some((f) => f.includes('High cost'))) {
    recommendations.push(
      'Set an on_cost breakpoint to pause before exceeding budget.',
    );
  }

  if (errorEvent.event_type === 'agent.failed') {
    recommendations.push(
      'Use fork_from_checkpoint to replay from the last known good state with modified inputs.',
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(
      'Review the causal chain above. Use set_breakpoint with on_error to catch this earlier next time.',
    );
  }

  return recommendations.join(' ');
}

function countByField(
  events: AgentEvent[],
  field: keyof AgentEvent,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const e of events) {
    const value = String(e[field]);
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function roundCost(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundPct(value: number): number {
  return Math.round(value * 10_000) / 100; // e.g., 0.5432 -> 54.32
}
