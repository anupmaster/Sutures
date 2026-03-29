/**
 * Event Router — Receives WebSocket messages, validates, routes events
 * to the ring buffer, checkpoint store, anomaly engine, and dashboard clients.
 * Handles command messages from the dashboard.
 */

import type { WebSocket } from 'ws';
import { v7 as uuidv7 } from 'uuid';
import {
  InboundMessageSchema,
  AgentEventSchema,
  CheckpointSchema,
  BreakpointConfigSchema,
  type AgentEvent,
  type SwarmTopology,
  type TopologyAgent,
  type TopologyEdge,
  type OutboundMessage,
  type DashboardCommand,
  type Checkpoint,
} from './schemas.js';
import { RingBuffer } from './ringBuffer.js';
import { CheckpointStore } from './checkpointStore.js';
import { BreakpointController } from './breakpointController.js';
import { AnomalyEngine } from './anomalyEngine.js';
import { OtelExporter } from './otelExporter.js';

export interface EventRouterConfig {
  ringBufferCapacity?: number;
  checkpointDbPath?: string;
  otelEndpoint?: string;
  otelEnabled?: boolean;
}

export class EventRouter {
  readonly ringBuffer: RingBuffer;
  readonly checkpointStore: CheckpointStore;
  readonly breakpointController: BreakpointController;
  readonly anomalyEngine: AnomalyEngine;
  readonly otelExporter: OtelExporter;

  /** Connected adapter WebSockets. */
  readonly adapterClients = new Set<WebSocket>();
  /** Connected dashboard WebSockets. */
  readonly dashboardClients = new Set<WebSocket>();

  /** Active topologies keyed by swarm_id. */
  private topologies = new Map<string, SwarmTopology>();

  constructor(config: EventRouterConfig = {}) {
    this.ringBuffer = new RingBuffer(config.ringBufferCapacity ?? 10_000);
    this.checkpointStore = new CheckpointStore(config.checkpointDbPath ?? ':memory:');
    this.breakpointController = new BreakpointController();
    this.anomalyEngine = new AnomalyEngine();
    this.otelExporter = new OtelExporter({
      endpoint: config.otelEndpoint,
      enabled: config.otelEnabled ?? false,
    });
  }

  /**
   * Handle a raw WebSocket message. Validates, determines type, and routes.
   */
  handleMessage(ws: WebSocket, raw: string, source: 'adapter' | 'dashboard'): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.sendError(ws, 'Invalid JSON');
      return;
    }

    const result = InboundMessageSchema.safeParse(parsed);
    if (!result.success) {
      this.sendError(ws, `Validation error: ${result.error.message}`);
      return;
    }

    const message = result.data;

    if (message.type === 'event') {
      this.handleEvent(message.payload, ws);
    } else if (message.type === 'command') {
      this.handleCommand(message, ws);
    }
  }

  /**
   * Process an incoming AgentEvent from an adapter.
   */
  private handleEvent(event: AgentEvent, sourceWs: WebSocket): void {
    // 1. Store in ring buffer
    this.ringBuffer.push(event);

    // 2. Update topology
    this.updateTopology(event);

    // 3. Handle checkpoint.created events
    if (event.event_type === 'checkpoint.created') {
      this.handleCheckpointCreated(event);
    }

    // 4. Evaluate breakpoints
    const matches = this.breakpointController.evaluateEvent(event);
    for (const match of matches) {
      const hitEvent = this.breakpointController.createHitEvent(match);

      // Store hit event in ring buffer too
      this.ringBuffer.push(hitEvent);

      // Send breakpoint.hit back to the originating adapter
      this.sendToSocket(sourceWs, { type: 'event', payload: hitEvent });

      // Broadcast hit event to all dashboards
      this.broadcastToDashboards({ type: 'event', payload: hitEvent });
    }

    // 5. Run anomaly detection
    const anomalies = this.anomalyEngine.evaluate(event);
    for (const anomaly of anomalies) {
      this.broadcastToDashboards({ type: 'anomaly', payload: anomaly });
    }

    // 6. Broadcast original event to dashboards
    this.broadcastToDashboards({ type: 'event', payload: event });

    // 7. Export to OTEL
    this.otelExporter.exportEvent(event);
  }

  /**
   * Handle a command message from a dashboard client.
   */
  private handleCommand(command: DashboardCommand, ws: WebSocket): void {
    const payload = command.payload ?? {};

    switch (command.command) {
      case 'set_breakpoint':
        this.handleSetBreakpoint(payload, ws);
        break;
      case 'release_breakpoint':
        this.handleReleaseBreakpoint(payload, ws);
        break;
      case 'inject_and_resume':
        this.handleInjectAndResume(payload, ws);
        break;
      case 'get_checkpoints':
        this.handleGetCheckpoints(payload, ws);
        break;
      case 'fork_from_checkpoint':
        this.handleForkFromCheckpoint(payload, ws);
        break;
      case 'get_topology':
        this.handleGetTopology(payload, ws);
        break;
      case 'get_events':
        this.handleGetEvents(payload, ws);
        break;
    }
  }

  private handleSetBreakpoint(payload: Record<string, unknown>, ws: WebSocket): void {
    const result = BreakpointConfigSchema.safeParse(payload);
    if (!result.success) {
      this.sendResponse(ws, 'set_breakpoint', { error: result.error.message });
      return;
    }
    const id = this.breakpointController.setBreakpoint(result.data);

    // Broadcast a breakpoint.set event
    const setEvent: AgentEvent = {
      event_id: uuidv7(),
      swarm_id: result.data.swarm_id ?? '*',
      agent_id: result.data.agent_id ?? '*',
      timestamp: new Date().toISOString(),
      event_type: 'breakpoint.set',
      severity: 'info',
      data: {
        breakpoint_id: id,
        condition: result.data.condition,
        value: result.data.value,
      },
      protocol_version: '1.0.0',
    };
    this.ringBuffer.push(setEvent);
    this.broadcastToDashboards({ type: 'event', payload: setEvent });

    this.sendResponse(ws, 'set_breakpoint', { breakpoint_id: id });
  }

  private handleReleaseBreakpoint(payload: Record<string, unknown>, ws: WebSocket): void {
    const id = typeof payload['breakpoint_id'] === 'string' ? payload['breakpoint_id'] : null;
    if (!id) {
      this.sendResponse(ws, 'release_breakpoint', { error: 'breakpoint_id required' });
      return;
    }
    const removed = this.breakpointController.releaseBreakpoint(id);

    if (removed) {
      // Broadcast a breakpoint.release event
      const releaseEvent: AgentEvent = {
        event_id: uuidv7(),
        swarm_id: '*',
        agent_id: '*',
        timestamp: new Date().toISOString(),
        event_type: 'breakpoint.release',
        severity: 'info',
        data: { breakpoint_id: id },
        protocol_version: '1.0.0',
      };
      this.ringBuffer.push(releaseEvent);
      this.broadcastToDashboards({ type: 'event', payload: releaseEvent });
    }

    this.sendResponse(ws, 'release_breakpoint', { removed });
  }

  private handleInjectAndResume(payload: Record<string, unknown>, ws: WebSocket): void {
    const agentId = typeof payload['agent_id'] === 'string' ? payload['agent_id'] : null;
    if (!agentId) {
      this.sendResponse(ws, 'inject_and_resume', { error: 'agent_id required' });
      return;
    }

    const injectionEvent = this.breakpointController.prepareInjection({
      agent_id: agentId,
      state: payload['state'] as Record<string, unknown> | undefined,
      messages: payload['messages'] as Array<Record<string, unknown>> | undefined,
      resume: true,
    });

    // Fill in swarm_id from topology if available
    for (const [swarmId, topo] of this.topologies) {
      if (topo.agents[agentId]) {
        injectionEvent.swarm_id = swarmId;
        break;
      }
    }

    // Broadcast injection to the adapter that owns this agent
    this.broadcastToAdapters({ type: 'event', payload: injectionEvent });
    this.ringBuffer.push(injectionEvent);
    this.broadcastToDashboards({ type: 'event', payload: injectionEvent });

    this.sendResponse(ws, 'inject_and_resume', { event_id: injectionEvent.event_id });
  }

  private handleGetCheckpoints(payload: Record<string, unknown>, ws: WebSocket): void {
    const threadId = typeof payload['thread_id'] === 'string' ? payload['thread_id'] : null;
    if (!threadId) {
      this.sendResponse(ws, 'get_checkpoints', { error: 'thread_id required' });
      return;
    }
    const checkpoints = this.checkpointStore.getByThreadId(threadId);
    this.sendResponse(ws, 'get_checkpoints', { checkpoints });
  }

  private handleForkFromCheckpoint(payload: Record<string, unknown>, ws: WebSocket): void {
    const checkpointId = typeof payload['checkpoint_id'] === 'string' ? payload['checkpoint_id'] : null;
    if (!checkpointId) {
      this.sendResponse(ws, 'fork_from_checkpoint', { error: 'checkpoint_id required' });
      return;
    }
    const checkpoint = this.checkpointStore.getById(checkpointId);
    if (!checkpoint) {
      this.sendResponse(ws, 'fork_from_checkpoint', { error: 'Checkpoint not found' });
      return;
    }

    // Create a forked checkpoint with a new ID
    const forkedCheckpoint: Checkpoint = {
      checkpoint_id: uuidv7(),
      thread_id: checkpoint.thread_id,
      agent_id: checkpoint.agent_id,
      swarm_id: checkpoint.swarm_id,
      state: checkpoint.state,
      memory_hierarchy: checkpoint.memory_hierarchy,
      parent_checkpoint_id: checkpoint.checkpoint_id,
      created_at: new Date().toISOString(),
    };
    this.checkpointStore.save(forkedCheckpoint);

    this.sendResponse(ws, 'fork_from_checkpoint', { checkpoint: forkedCheckpoint });
  }

  private handleGetTopology(payload: Record<string, unknown>, ws: WebSocket): void {
    const swarmId = typeof payload['swarm_id'] === 'string' ? payload['swarm_id'] : null;
    if (swarmId) {
      const topo = this.topologies.get(swarmId);
      this.sendResponse(ws, 'get_topology', { topology: topo ?? null });
    } else {
      // Return all topologies
      const all = Object.fromEntries(this.topologies);
      this.sendResponse(ws, 'get_topology', { topologies: all });
    }
  }

  private handleGetEvents(payload: Record<string, unknown>, ws: WebSocket): void {
    const swarmId = typeof payload['swarm_id'] === 'string' ? payload['swarm_id'] : null;
    const agentId = typeof payload['agent_id'] === 'string' ? payload['agent_id'] : null;
    const limit = typeof payload['limit'] === 'number' ? payload['limit'] : 100;

    let events: AgentEvent[];
    if (swarmId) {
      events = this.ringBuffer.getBySwarmId(swarmId);
    } else if (agentId) {
      events = this.ringBuffer.getByAgentId(agentId);
    } else {
      events = this.ringBuffer.getRecent(limit);
    }

    // Apply limit
    if (events.length > limit) {
      events = events.slice(-limit);
    }

    this.sendResponse(ws, 'get_events', { events });
  }

  /**
   * Update the swarm topology from lifecycle and handoff events.
   */
  private updateTopology(event: AgentEvent): void {
    const swarmId = event.swarm_id;

    let topology = this.topologies.get(swarmId);
    if (!topology) {
      topology = {
        swarm_id: swarmId,
        agents: {},
        edges: [],
        updated_at: event.timestamp,
      };
      this.topologies.set(swarmId, topology);
    }

    topology.updated_at = event.timestamp;

    switch (event.event_type) {
      case 'agent.spawned': {
        const agent: TopologyAgent = {
          agent_id: event.agent_id,
          parent_agent_id: event.parent_agent_id,
          status: 'spawned',
          name: typeof event.data['name'] === 'string' ? event.data['name'] : undefined,
          model: typeof event.data['model'] === 'string' ? event.data['model'] : undefined,
          spawned_at: event.timestamp,
        };
        topology.agents[event.agent_id] = agent;
        break;
      }
      case 'agent.idle':
        this.setAgentStatus(topology, event.agent_id, 'idle');
        break;
      case 'agent.completed':
        this.setAgentStatus(topology, event.agent_id, 'completed');
        if (topology.agents[event.agent_id]) {
          topology.agents[event.agent_id].completed_at = event.timestamp;
        }
        break;
      case 'agent.failed':
        this.setAgentStatus(topology, event.agent_id, 'failed');
        if (topology.agents[event.agent_id]) {
          topology.agents[event.agent_id].completed_at = event.timestamp;
        }
        break;
      case 'agent.paused':
        this.setAgentStatus(topology, event.agent_id, 'paused');
        break;
      case 'agent.resumed':
        this.setAgentStatus(topology, event.agent_id, 'idle');
        break;
      case 'turn.thinking':
        this.setAgentStatus(topology, event.agent_id, 'thinking');
        break;
      case 'turn.acting':
        this.setAgentStatus(topology, event.agent_id, 'acting');
        break;
      case 'turn.observed':
        this.setAgentStatus(topology, event.agent_id, 'observing');
        break;
      case 'handoff.initiated': {
        const targetId = typeof event.data['target_agent_id'] === 'string'
          ? event.data['target_agent_id']
          : null;
        if (targetId) {
          const edge: TopologyEdge = {
            from_agent_id: event.agent_id,
            to_agent_id: targetId,
            type: 'handoff',
            timestamp: event.timestamp,
          };
          topology.edges.push(edge);
        }
        break;
      }
    }

    // Broadcast topology update to dashboards
    this.broadcastToDashboards({ type: 'topology', payload: topology });
  }

  private setAgentStatus(
    topology: SwarmTopology,
    agentId: string,
    status: TopologyAgent['status'],
  ): void {
    if (topology.agents[agentId]) {
      topology.agents[agentId].status = status;
    }
  }

  /**
   * Handle checkpoint.created events by saving to the store.
   */
  private handleCheckpointCreated(event: AgentEvent): void {
    const data = event.data;
    const checkpointResult = CheckpointSchema.safeParse({
      checkpoint_id: data['checkpoint_id'] ?? event.event_id,
      thread_id: data['thread_id'] ?? event.swarm_id,
      agent_id: event.agent_id,
      swarm_id: event.swarm_id,
      state: data['state'] ?? {},
      memory_hierarchy: data['memory_hierarchy'],
      parent_checkpoint_id: data['parent_checkpoint_id'],
      created_at: event.timestamp,
    });

    if (checkpointResult.success) {
      this.checkpointStore.save(checkpointResult.data);
    } else {
      console.warn('[EventRouter] Invalid checkpoint data:', checkpointResult.error.message);
    }
  }

  /** Get a topology by swarm_id. */
  getTopology(swarmId: string): SwarmTopology | undefined {
    return this.topologies.get(swarmId);
  }

  /** Get all topologies. */
  getAllTopologies(): Map<string, SwarmTopology> {
    return this.topologies;
  }

  // ── WebSocket helpers ─────────────────────────────────────────

  private broadcastToDashboards(message: OutboundMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.dashboardClients) {
      if (client.readyState === 1 /* WebSocket.OPEN */) {
        client.send(data);
      }
    }
  }

  private broadcastToAdapters(message: OutboundMessage): void {
    const data = JSON.stringify(message);
    for (const client of this.adapterClients) {
      if (client.readyState === 1 /* WebSocket.OPEN */) {
        client.send(data);
      }
    }
  }

  private sendToSocket(ws: WebSocket, message: OutboundMessage): void {
    if (ws.readyState === 1 /* WebSocket.OPEN */) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendResponse(ws: WebSocket, command: string, data: unknown): void {
    this.sendToSocket(ws, { type: 'response', command, data });
  }

  private sendError(ws: WebSocket, message: string): void {
    this.sendToSocket(ws, { type: 'response', command: 'error', data: { error: message } });
  }

  /** Graceful shutdown. */
  async shutdown(): Promise<void> {
    this.checkpointStore.close();
    await this.otelExporter.shutdown();
  }
}
