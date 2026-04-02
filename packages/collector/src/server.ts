/**
 * Server — Main Fastify server with WebSocket and REST endpoints.
 *
 * WS port 9470: Adapter and dashboard connections via /v1/events
 * HTTP port 9471: REST API for health, topology, events, checkpoints
 */

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebSocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import type { WebSocket } from 'ws';
import { v7 as uuidv7 } from 'uuid';
import { EventRouter, type EventRouterConfig } from './eventRouter.js';
import { loadPlugins } from './pluginLoader.js';
import type { AgentEvent } from './schemas.js';

export interface CollectorServerConfig extends EventRouterConfig {
  /** WebSocket server port for adapter + dashboard connections. Default: 9470 */
  wsPort?: number;
  /** HTTP REST API port. Default: 9471 */
  httpPort?: number;
  /** Host to bind to. Default: 0.0.0.0 */
  host?: string;
  /** CORS origin for HTTP API. Default: * */
  corsOrigin?: string;
}

export interface CollectorServer {
  wsServer: FastifyInstance;
  httpServer: FastifyInstance;
  router: EventRouter;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Create and configure the collector server instances.
 * Call `.start()` to begin listening.
 */
export function createCollectorServer(config: CollectorServerConfig = {}): CollectorServer {
  const wsPort = config.wsPort ?? 9470;
  const httpPort = config.httpPort ?? 9471;
  const host = config.host ?? '0.0.0.0';
  const corsOrigin = config.corsOrigin ?? '*';

  const router = new EventRouter({
    ringBufferCapacity: config.ringBufferCapacity,
    checkpointDbPath: config.checkpointDbPath,
    otelEndpoint: config.otelEndpoint,
    otelEnabled: config.otelEnabled,
  });

  // ── WebSocket Server (port 9470) ─────────────────────────────

  const wsServer = Fastify({ logger: { level: 'info' } });

  const wsSetupPromise = (async () => {
    await wsServer.register(fastifyWebSocket);
    await wsServer.register(fastifyCors, { origin: corsOrigin });

    // Health endpoint on WS server too
    wsServer.get('/health', async () => ({
      status: 'ok',
      service: 'sutures-collector-ws',
      adapters: router.adapterClients.size,
      dashboards: router.dashboardClients.size,
      events: router.ringBuffer.size,
      timestamp: new Date().toISOString(),
    }));

    // Main WebSocket route for adapters
    wsServer.get('/v1/events', { websocket: true }, (socket) => {
      handleAdapterConnection(socket, router);
    });

    // WebSocket route for dashboard clients
    wsServer.get('/v1/dashboard', { websocket: true }, (socket) => {
      handleDashboardConnection(socket, router);
    });
  })();

  // ── HTTP REST Server (port 9471) ─────────────────────────────

  const httpServer = Fastify({ logger: { level: 'info' } });

  const httpSetupPromise = (async () => {
    await httpServer.register(fastifyCors, { origin: corsOrigin });

    httpServer.get('/health', async () => ({
      status: 'ok',
      service: 'sutures-collector',
      adapters: router.adapterClients.size,
      dashboards: router.dashboardClients.size,
      events: router.ringBuffer.size,
      breakpoints: router.breakpointController.getAll().length,
      timestamp: new Date().toISOString(),
    }));

    httpServer.get('/api/topology', async (request) => {
      const query = request.query as Record<string, string>;
      const swarmId = query['swarm_id'];
      if (swarmId) {
        return { topology: router.getTopology(swarmId) ?? null };
      }
      const all: Record<string, unknown> = {};
      for (const [id, topo] of router.getAllTopologies()) {
        all[id] = topo;
      }
      return { topologies: all };
    });

    httpServer.get('/api/events', async (request) => {
      const query = request.query as Record<string, string>;
      const swarmId = query['swarm_id'];
      const agentId = query['agent_id'];
      const limit = parseInt(query['limit'] ?? '100', 10);

      if (swarmId) {
        const events = router.ringBuffer.getBySwarmId(swarmId);
        return { events: events.slice(-limit) };
      }
      if (agentId) {
        const events = router.ringBuffer.getByAgentId(agentId);
        return { events: events.slice(-limit) };
      }
      return { events: router.ringBuffer.getRecent(limit) };
    });

    httpServer.get('/api/checkpoints', async (request) => {
      const query = request.query as Record<string, string>;
      const threadId = query['thread_id'];
      if (!threadId) {
        return { error: 'thread_id query parameter required' };
      }
      const checkpoints = router.checkpointStore.getByThreadId(threadId);
      return { checkpoints };
    });

    httpServer.get('/api/breakpoints', async () => {
      return { breakpoints: router.breakpointController.getAll() };
    });

    httpServer.post('/api/simulate', async () => {
      // Fire off demo simulation in the background
      runBuiltInDemo(router);
      return { status: 'started', message: 'Demo simulation started' };
    });

    // ── Shadow Agent REST Endpoints ──────────────────────────────

    httpServer.post('/api/shadow/spawn', async (request) => {
      const body = request.body as Record<string, unknown> | undefined;
      const checkpointId = typeof body?.['checkpoint_id'] === 'string' ? body['checkpoint_id'] : null;
      if (!checkpointId) {
        return { error: 'checkpoint_id required' };
      }

      const checkpoint = router.checkpointStore.getById(checkpointId);
      if (!checkpoint) {
        return { error: 'Checkpoint not found' };
      }

      const description = typeof body?.['description'] === 'string' ? body['description'] : undefined;

      const { entry, event } = router.shadowManager.spawnShadow(
        checkpointId,
        checkpoint.agent_id,
        checkpoint.swarm_id,
        { description },
      );

      router.ringBuffer.push(event);
      // Broadcast to dashboards via the router's broadcastToDashboards (use injectEvent for full pipeline)
      router.injectEvent(event);

      return {
        shadow_id: entry.shadow_id,
        parent_checkpoint_id: entry.parent_checkpoint_id,
        parent_agent_id: entry.parent_agent_id,
        swarm_id: entry.swarm_id,
        status: entry.status,
        spawned_at: entry.spawned_at,
      };
    });

    httpServer.post('/api/shadow/:id/promote', async (request) => {
      const { id } = request.params as { id: string };

      const result = router.shadowManager.promoteShadow(id);
      if (!result) {
        return { error: 'Shadow not found or not in running state' };
      }

      router.injectEvent(result.event);

      return {
        shadow_id: result.entry.shadow_id,
        status: result.entry.status,
        promoted_at: result.entry.promoted_at,
      };
    });

    httpServer.post('/api/shadow/:id/dismiss', async (request) => {
      const { id } = request.params as { id: string };

      const result = router.shadowManager.dismissShadow(id);
      if (!result) {
        return { error: 'Shadow not found or not in running state' };
      }

      router.injectEvent(result.event);

      return {
        shadow_id: result.entry.shadow_id,
        status: result.entry.status,
        dismissed_at: result.entry.dismissed_at,
      };
    });

    httpServer.get('/api/shadows', async (request) => {
      const query = request.query as Record<string, string>;
      const swarmId = query['swarm_id'];
      const shadows = router.shadowManager.listShadows(swarmId);
      return {
        shadows: shadows.map((s) => ({
          shadow_id: s.shadow_id,
          parent_checkpoint_id: s.parent_checkpoint_id,
          parent_agent_id: s.parent_agent_id,
          swarm_id: s.swarm_id,
          status: s.status,
          description: s.description,
          event_count: s.events.length,
          spawned_at: s.spawned_at,
          promoted_at: s.promoted_at,
          dismissed_at: s.dismissed_at,
        })),
      };
    });

    // ── Trace-to-Test Fixture Export ─────────────────────────────

    httpServer.get('/api/export/test-fixture', async (request) => {
      const query = request.query as Record<string, string>;
      const swarmId = query['swarm_id'];
      const format = query['format'] === 'vitest' ? 'vitest' : 'pytest';
      const limit = parseInt(query['limit'] ?? '1000', 10);

      let events: AgentEvent[];
      if (swarmId) {
        events = router.ringBuffer.getBySwarmId(swarmId);
        events = events.slice(-limit);
      } else {
        events = router.ringBuffer.getRecent(limit);
      }

      if (events.length === 0) {
        return { error: 'No events found', fixture: null, testCode: null, metadata: null };
      }

      // Build topology snapshot
      const relevantTopologies: Record<string, unknown> = {};
      const swarmIds = new Set(events.map((e) => e.swarm_id));
      for (const sid of swarmIds) {
        const topo = router.getTopology(sid);
        if (topo) {
          relevantTopologies[sid] = topo;
        }
      }

      // Derive assertions
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

      const roundCost = (v: number) => Math.round(v * 1_000_000) / 1_000_000;
      const costMin = Math.max(0, roundCost(totalCost * 0.9));
      const costMax = roundCost(totalCost * 1.1);

      const resolvedSwarmId = swarmId ?? [...swarmIds][0] ?? 'unknown';
      const fixtureFileName = `fixture_${resolvedSwarmId}.json`;

      const fixture = {
        version: '1.0.0',
        swarm_id: resolvedSwarmId,
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

      const testCode = format === 'vitest'
        ? generateVitestCode(fixtureFileName)
        : generatePytestCode(fixtureFileName);

      const testFileName = format === 'vitest'
        ? fixtureFileName.replace('.json', '.test.ts')
        : fixtureFileName.replace('.json', '_test.py');

      return {
        fixture,
        testCode,
        metadata: {
          format,
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
      };
    });
  })();

  return {
    wsServer,
    httpServer,
    router,

    async start() {
      await wsSetupPromise;
      await httpSetupPromise;

      // Load plugins before starting servers
      const plugins = await loadPlugins(router);
      if (plugins.length > 0) {
        console.log(`[Collector] Loaded ${plugins.length} plugin(s): ${plugins.join(', ')}`);
      }

      await wsServer.listen({ port: wsPort, host });
      await httpServer.listen({ port: httpPort, host });
      console.log(`[Collector] WebSocket server listening on ws://${host}:${wsPort}`);
      console.log(`[Collector] HTTP API server listening on http://${host}:${httpPort}`);
    },

    async stop() {
      console.log('[Collector] Shutting down...');
      await router.shutdown();
      await wsServer.close();
      await httpServer.close();
      console.log('[Collector] Stopped.');
    },
  };
}

// ── WebSocket Connection Handlers ──────────────────────────────

function handleAdapterConnection(socket: WebSocket, router: EventRouter): void {
  router.adapterClients.add(socket);
  console.log(`[Collector] Adapter connected (total: ${router.adapterClients.size})`);

  socket.on('message', (data) => {
    try {
      const raw = typeof data === 'string' ? data : data.toString('utf-8');
      router.handleMessage(socket, raw, 'adapter');
    } catch (err) {
      console.error('[Collector] Error handling adapter message:', err);
    }
  });

  socket.on('close', () => {
    router.adapterClients.delete(socket);
    console.log(`[Collector] Adapter disconnected (total: ${router.adapterClients.size})`);
  });

  socket.on('error', (err) => {
    console.error('[Collector] Adapter WebSocket error:', err);
    router.adapterClients.delete(socket);
  });
}

function handleDashboardConnection(socket: WebSocket, router: EventRouter): void {
  router.dashboardClients.add(socket);
  console.log(`[Collector] Dashboard connected (total: ${router.dashboardClients.size})`);

  // Send current topologies on connect
  for (const [, topology] of router.getAllTopologies()) {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify({ type: 'topology', payload: topology }));
    }
  }

  // Send recent events so dashboard isn't empty if opened after events arrived
  const recentEvents = router.ringBuffer.getRecent(500);
  for (const event of recentEvents) {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify({ type: 'event', payload: event }));
    }
  }

  socket.on('message', (data) => {
    try {
      const raw = typeof data === 'string' ? data : data.toString('utf-8');
      router.handleMessage(socket, raw, 'dashboard');
    } catch (err) {
      console.error('[Collector] Error handling dashboard message:', err);
    }
  });

  socket.on('close', () => {
    router.removeSession(socket);
    router.dashboardClients.delete(socket);
    console.log(`[Collector] Dashboard disconnected (total: ${router.dashboardClients.size})`);
  });

  socket.on('error', (err) => {
    console.error('[Collector] Dashboard WebSocket error:', err);
    router.removeSession(socket);
    router.dashboardClients.delete(socket);
  });
}

// ── Test Fixture Code Generators ─────────────────────────────────

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

// ── Built-in Demo Simulator ──────────────────────────────────────

function makeEvent(swarmId: string, agentId: string, eventType: AgentEvent['event_type'], data: Record<string, unknown>, severity: AgentEvent['severity'] = 'info'): AgentEvent {
  return {
    event_id: uuidv7(),
    swarm_id: swarmId,
    agent_id: agentId,
    timestamp: new Date().toISOString(),
    event_type: eventType,
    severity,
    data,
    protocol_version: '1.0.0',
  };
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

/**
 * Inject a demo 3-agent swarm directly into the event router.
 * No external processes or Python needed.
 */
async function runBuiltInDemo(router: EventRouter): Promise<void> {
  const swarmId = uuidv7().slice(0, 8);
  console.log(`[Demo] Starting simulation (swarm: ${swarmId})`);

  // Inject an event by feeding it through the router's public message handler
  function inject(event: AgentEvent) {
    const msg = JSON.stringify({ type: 'event', payload: event });
    // Use handleMessage with null socket (no adapter to reply to)
    router.injectEvent(event);
  }

  // Spawn agents
  inject(makeEvent(swarmId, 'researcher', 'agent.spawned', { name: 'Researcher', role: 'research', model: 'claude-sonnet-4-20250514', tools: ['web_search', 'arxiv_search', 'read_paper'] }));
  await sleep(200);
  inject(makeEvent(swarmId, 'critic', 'agent.spawned', { name: 'Critic', role: 'evaluation', model: 'claude-sonnet-4-20250514', tools: ['evaluate'] }));
  await sleep(200);
  inject(makeEvent(swarmId, 'writer', 'agent.spawned', { name: 'Writer', role: 'writing', model: 'claude-opus-4-20250514', tools: ['write_document', 'format_markdown'] }));
  await sleep(500);

  // Researcher: 3 turns
  const tools = ['web_search', 'arxiv_search', 'read_paper'];
  const toolInputs = ['multi-agent memory architectures 2025-2026', 'G-Memory hierarchical agent memory', 'MemoryOS three-tier architecture paper'];
  const toolOutputs = ['Found 12 results on hierarchical memory architectures...', 'G-Memory: 3-tier graph (Insight/Query/Interaction), NeurIPS spotlight...', 'Full paper: G-Memory proposes organizational memory theory for MAS...'];
  const thinkingContent = [
    'I need to search for recent papers on multi-agent memory architectures. Let me start with a broad web search to find the latest work.',
    'The web search found several promising leads. Let me check arXiv for the G-Memory and MemoryOS papers specifically.',
    'I found the key papers. Let me read the full MemoryOS paper to understand their 3-tier hierarchy (STM/MTM/LTM).',
  ];
  const turnInputs = [
    'Research multi-agent memory architectures — focus on hierarchical storage tiers',
    'Research multi-agent memory architectures — focus on conflict resolution strategies',
    'Research multi-agent memory architectures — focus on context window optimization',
  ];

  for (let turn = 0; turn < 3; turn++) {
    inject(makeEvent(swarmId, 'researcher', 'turn.started', { turn_number: turn + 1, input: turnInputs[turn], input_tokens: 150 + turn * 50 }));
    await sleep(400);
    inject(makeEvent(swarmId, 'researcher', 'turn.thinking', { turn_number: turn + 1, model: 'claude-sonnet-4-20250514', content: thinkingContent[turn], prompt_tokens: 200 + turn * 100 }, 'debug'));
    await sleep(600);
    inject(makeEvent(swarmId, 'researcher', 'turn.acting', { turn_number: turn + 1, tool_name: tools[turn], tool_input_summary: toolInputs[turn] }));
    await sleep(800);
    inject(makeEvent(swarmId, 'researcher', 'turn.observed', { turn_number: turn + 1, tool_name: tools[turn], tool_output_summary: toolOutputs[turn], output_tokens: 300 + turn * 150 }));
    await sleep(200);
    inject(makeEvent(swarmId, 'researcher', 'cost.tokens', { model: 'claude-sonnet-4-20250514', input_tokens: 200 + turn * 100, output_tokens: 300 + turn * 150, cost_usd: 0.003 * (turn + 1), cumulative_cost_usd: 0.003 * (turn + 1) * ((turn + 2) / 2) }));
    inject(makeEvent(swarmId, 'researcher', 'turn.completed', { turn_number: turn + 1, output_summary: `Research turn ${turn + 1}: key insights on memory architectures`, duration_ms: 2500 + turn * 500 }));
    await sleep(300);
  }

  // Handoff: Researcher → Critic
  inject(makeEvent(swarmId, 'researcher', 'handoff.initiated', { source_agent_id: 'researcher', target_agent_id: 'critic', reason: 'Research complete, needs quality evaluation' }));
  await sleep(300);
  inject(makeEvent(swarmId, 'critic', 'handoff.accepted', { source_agent_id: 'researcher', target_agent_id: 'critic' }));
  await sleep(500);

  // Critic: 1 turn
  inject(makeEvent(swarmId, 'critic', 'turn.started', { turn_number: 1, input: 'Evaluate the research output from Researcher: 3 papers on multi-agent memory architectures. Score on relevance, depth, recency, and citation quality.', input_tokens: 800 }));
  await sleep(400);
  inject(makeEvent(swarmId, 'critic', 'turn.thinking', { turn_number: 1, model: 'claude-sonnet-4-20250514', content: 'Let me evaluate the research findings. The papers cover MemoryOS (3-tier hierarchy), G-Memory (graph-based shared memory), and FluxMem (dynamic structure switching). I need to check coverage, recency, and whether practical implementation details are included.', prompt_tokens: 1200 }, 'debug'));
  await sleep(800);
  inject(makeEvent(swarmId, 'critic', 'turn.acting', { turn_number: 1, tool_name: 'evaluate', tool_input_summary: 'Scoring on relevance, depth, recency, citation quality' }));
  await sleep(500);
  inject(makeEvent(swarmId, 'critic', 'turn.observed', { turn_number: 1, tool_name: 'evaluate', tool_output_summary: 'Score: 8.5/10. Strong recency, needs more practical examples.', output_tokens: 450 }));
  await sleep(200);
  inject(makeEvent(swarmId, 'critic', 'cost.tokens', { model: 'claude-sonnet-4-20250514', input_tokens: 1200, output_tokens: 450, cost_usd: 0.008, cumulative_cost_usd: 0.008 }));
  inject(makeEvent(swarmId, 'critic', 'turn.completed', { turn_number: 1, output_summary: 'Evaluation: 8.5/10', duration_ms: 3200 }));
  await sleep(300);

  // Handoff: Critic → Writer
  inject(makeEvent(swarmId, 'critic', 'handoff.initiated', { source_agent_id: 'critic', target_agent_id: 'writer', reason: 'Research approved, ready for writing' }));
  await sleep(300);
  inject(makeEvent(swarmId, 'writer', 'handoff.accepted', { source_agent_id: 'critic', target_agent_id: 'writer' }));
  await sleep(500);

  // Set a breakpoint on Writer's tool call to demo intervention
  const bpId = router.breakpointController.setBreakpoint({
    agent_id: 'writer',
    swarm_id: swarmId,
    condition: 'on_tool',
    value: 'write_document',
    once: true,
  });
  // Broadcast the breakpoint.set event so the dashboard shows it
  const bpSetEvent = makeEvent(swarmId, 'writer', 'breakpoint.set', {
    breakpoint_id: bpId,
    condition: 'on_tool',
    value: 'write_document',
  });
  inject(bpSetEvent);
  await sleep(200);

  // Writer: 1 turn — breakpoint will fire on turn.acting
  inject(makeEvent(swarmId, 'writer', 'turn.started', { turn_number: 1, input: 'Write a comprehensive 2000-word report on multi-agent memory architectures. Include the 3-tier hierarchy from MemoryOS, G-Memory graph approach, and FluxMem dynamic switching. Add code examples.', input_tokens: 2000 }));
  await sleep(400);
  inject(makeEvent(swarmId, 'writer', 'turn.thinking', { turn_number: 1, model: 'claude-opus-4-20250514', content: "I'll structure this report with: 1) Introduction to the memory problem in multi-agent systems, 2) MemoryOS 3-tier architecture (STM/MTM/LTM), 3) G-Memory graph-based shared memory, 4) FluxMem dynamic structure switching, 5) Practical implementation patterns with code examples, 6) Comparison table and recommendations.", prompt_tokens: 2500 }, 'debug'));
  await sleep(1200);
  // This will trigger the breakpoint → writer pauses
  inject(makeEvent(swarmId, 'writer', 'turn.acting', { turn_number: 1, tool_name: 'write_document', tool_input_summary: 'Writing 2000-word report with intro, hierarchy, examples, conclusion' }));
  await sleep(3000); // Hold the paused state for 3 seconds so user sees it

  // Auto-resume: inject and release
  inject(makeEvent(swarmId, 'writer', 'breakpoint.release', { breakpoint_id: bpId }));
  inject(makeEvent(swarmId, 'writer', 'agent.resumed', {}));
  await sleep(500);

  inject(makeEvent(swarmId, 'writer', 'turn.observed', { turn_number: 1, tool_name: 'write_document', tool_output_summary: 'Generated 2,150 word report with code examples', output_tokens: 3200 }));
  await sleep(200);
  inject(makeEvent(swarmId, 'writer', 'cost.tokens', { model: 'claude-opus-4-20250514', input_tokens: 2500, output_tokens: 3200, cost_usd: 0.278, cumulative_cost_usd: 0.278 }));
  inject(makeEvent(swarmId, 'writer', 'turn.completed', { turn_number: 1, output_summary: 'Report generated: 2,150 words with code examples', duration_ms: 6500 }));
  await sleep(300);

  // Memory events to populate the Memory Debugger
  inject(makeEvent(swarmId, 'researcher', 'memory.write', { key: 'search_results', value: 'Found 12 papers on hierarchical memory architectures including MemoryOS, G-Memory, FluxMem', tier: 'stm', shared: true, reader_agent_ids: ['critic', 'writer'] }));
  await sleep(200);
  inject(makeEvent(swarmId, 'researcher', 'memory.write', { key: 'g_memory_notes', value: 'G-Memory: 3-tier graph (Insight/Query/Interaction), NeurIPS spotlight paper', tier: 'stm', shared: false }));
  await sleep(200);
  inject(makeEvent(swarmId, 'researcher', 'memory.write', { key: 'memoryos_architecture', value: 'MemoryOS: STM (8K buffer) → MTM (32K indexed) → LTM (128K compressed). FIFO eviction with heat-based promotion.', tier: 'stm', shared: true, reader_agent_ids: ['writer'] }));
  await sleep(300);

  // Migration: STM → MTM (research findings consolidated)
  inject(makeEvent(swarmId, 'researcher', 'memory.tier_migration', { key: 'search_results', from_tier: 'stm', to_tier: 'mtm', reason: 'Accessed 3+ times, promoting to medium-term memory' }));
  await sleep(200);

  // Critic writes evaluation to memory
  inject(makeEvent(swarmId, 'critic', 'memory.write', { key: 'evaluation_score', value: 'Score: 8.5/10. Strong recency and breadth, needs more practical implementation examples.', tier: 'stm', shared: true, reader_agent_ids: ['writer'] }));
  await sleep(200);

  // Writer reads shared memory
  inject(makeEvent(swarmId, 'writer', 'memory.read', { key: 'search_results' }));
  await sleep(100);
  inject(makeEvent(swarmId, 'writer', 'memory.read', { key: 'memoryos_architecture' }));
  await sleep(100);
  inject(makeEvent(swarmId, 'writer', 'memory.read', { key: 'evaluation_score' }));
  await sleep(200);

  // Writer stores document outline
  inject(makeEvent(swarmId, 'writer', 'memory.write', { key: 'report_outline', value: '1) Intro 2) MemoryOS 3-tier 3) G-Memory graph 4) FluxMem switching 5) Code examples 6) Comparison', tier: 'stm', shared: false }));
  await sleep(200);

  // Promote consolidated research to LTM
  inject(makeEvent(swarmId, 'researcher', 'memory.tier_migration', { key: 'g_memory_notes', from_tier: 'stm', to_tier: 'ltm', reason: 'Core research finding — long-term retention' }));
  await sleep(300);

  // Complete all agents
  inject(makeEvent(swarmId, 'researcher', 'agent.completed', { total_cost_usd: 0.018 }));
  await sleep(200);
  inject(makeEvent(swarmId, 'critic', 'agent.completed', { total_cost_usd: 0.008 }));
  await sleep(200);
  inject(makeEvent(swarmId, 'writer', 'agent.completed', { total_cost_usd: 0.278 }));

  console.log(`[Demo] Simulation complete (swarm: ${swarmId}, total: $0.304)`);
}
