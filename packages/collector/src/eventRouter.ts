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
  type SessionMessage,
  type SessionPayload,
  type Checkpoint,
} from './schemas.js';
import { RingBuffer } from './ringBuffer.js';
import { CheckpointStore } from './checkpointStore.js';
import { BreakpointController } from './breakpointController.js';
import { AnomalyEngine } from './anomalyEngine.js';
import { OtelExporter } from './otelExporter.js';
import { CommandRegistry, type CommandHandlerContext } from './commandRegistry.js';

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
  readonly commandRegistry: CommandRegistry;

  /** Connected adapter WebSockets. */
  readonly adapterClients = new Set<WebSocket>();
  /** Connected dashboard WebSockets. */
  readonly dashboardClients = new Set<WebSocket>();

  /** Active topologies keyed by swarm_id. */
  private topologies = new Map<string, SwarmTopology>();

  /** Collaborative session tracking: WebSocket → session info. */
  private sessions = new Map<WebSocket, { session_id: string; user_name: string; color: string }>();
  private static SESSION_COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#14B8A6', '#F97316'];

  constructor(config: EventRouterConfig = {}) {
    this.ringBuffer = new RingBuffer(config.ringBufferCapacity ?? 10_000);
    this.checkpointStore = new CheckpointStore(config.checkpointDbPath ?? ':memory:');
    this.breakpointController = new BreakpointController();
    this.anomalyEngine = new AnomalyEngine();
    this.otelExporter = new OtelExporter({
      endpoint: config.otelEndpoint,
      enabled: config.otelEnabled ?? false,
    });
    this.commandRegistry = new CommandRegistry();
    this.registerBuiltInCommands();
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
      console.error('[EventRouter] Validation error:', result.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', '));
      this.sendError(ws, `Validation error: ${result.error.message}`);
      return;
    }

    const message = result.data;

    if (message.type === 'event') {
      this.handleEvent(message.payload, ws);
    } else if (message.type === 'command') {
      this.handleCommand(message, ws);
    } else if (message.type === 'session') {
      this.handleSession(message as SessionMessage, ws);
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
   * Dispatches via the CommandRegistry (supports built-in + plugin commands).
   */
  private handleCommand(command: DashboardCommand, ws: WebSocket): void {
    const payload = command.payload ?? {};
    const handler = this.commandRegistry.get(command.command);

    if (handler) {
      const ctx: CommandHandlerContext = {
        sendResponse: (cmd, data) => this.sendResponse(ws, cmd, data),
        broadcastToDashboards: (msg) => this.broadcastToDashboards(msg as OutboundMessage),
        broadcastToAdapters: (msg) => this.broadcastToAdapters(msg as OutboundMessage),
      };
      void handler.handler(payload, ctx);
    }
  }

  /**
   * Register all built-in commands into the CommandRegistry.
   */
  private registerBuiltInCommands(): void {
    const self = this;

    this.commandRegistry.register({
      name: 'set_breakpoint',
      handler(payload, ctx) { self.handleSetBreakpoint(payload, ctx); },
    });
    this.commandRegistry.register({
      name: 'release_breakpoint',
      handler(payload, ctx) { self.handleReleaseBreakpoint(payload, ctx); },
    });
    this.commandRegistry.register({
      name: 'inject_and_resume',
      handler(payload, ctx) { self.handleInjectAndResume(payload, ctx); },
    });
    this.commandRegistry.register({
      name: 'get_checkpoints',
      handler(payload, ctx) { self.handleGetCheckpoints(payload, ctx); },
    });
    this.commandRegistry.register({
      name: 'fork_from_checkpoint',
      handler(payload, ctx) { self.handleForkFromCheckpoint(payload, ctx); },
    });
    this.commandRegistry.register({
      name: 'get_topology',
      handler(payload, ctx) { self.handleGetTopology(payload, ctx); },
    });
    this.commandRegistry.register({
      name: 'get_events',
      handler(payload, ctx) { self.handleGetEvents(payload, ctx); },
    });
    this.commandRegistry.register({
      name: 'pause_all',
      handler(payload, ctx) { self.handlePauseAll(payload, ctx); },
    });
    this.commandRegistry.register({
      name: 'resume_all',
      handler(payload, ctx) { self.handleResumeAll(payload, ctx); },
    });
  }

  private handleSetBreakpoint(payload: Record<string, unknown>, ctx: CommandHandlerContext): void {
    const result = BreakpointConfigSchema.safeParse(payload);
    if (!result.success) {
      ctx.sendResponse('set_breakpoint', { error: result.error.message });
      return;
    }
    const id = this.breakpointController.setBreakpoint(result.data);

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

    ctx.sendResponse('set_breakpoint', { breakpoint_id: id });
  }

  private handleReleaseBreakpoint(payload: Record<string, unknown>, ctx: CommandHandlerContext): void {
    const id = typeof payload['breakpoint_id'] === 'string' ? payload['breakpoint_id'] : null;
    if (!id) {
      ctx.sendResponse('release_breakpoint', { error: 'breakpoint_id required' });
      return;
    }
    const removed = this.breakpointController.releaseBreakpoint(id);

    if (removed) {
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

    ctx.sendResponse('release_breakpoint', { removed });
  }

  private handleInjectAndResume(payload: Record<string, unknown>, ctx: CommandHandlerContext): void {
    const agentId = typeof payload['agent_id'] === 'string' ? payload['agent_id'] : null;
    if (!agentId) {
      ctx.sendResponse('inject_and_resume', { error: 'agent_id required' });
      return;
    }

    const mode = typeof payload['mode'] === 'string' ? payload['mode'] : 'append';

    const injectionEvent = this.breakpointController.prepareInjection({
      agent_id: agentId,
      state: payload['state'] as Record<string, unknown> | undefined,
      messages: payload['messages'] as Array<Record<string, unknown>> | undefined,
      resume: true,
    });

    (injectionEvent.data as Record<string, unknown>).mode = mode;

    for (const [swarmId, topo] of this.topologies) {
      if (topo.agents[agentId]) {
        injectionEvent.swarm_id = swarmId;
        break;
      }
    }

    this.broadcastToAdapters({ type: 'event', payload: injectionEvent });
    this.ringBuffer.push(injectionEvent);
    this.broadcastToDashboards({ type: 'event', payload: injectionEvent });

    ctx.sendResponse('inject_and_resume', { event_id: injectionEvent.event_id });
  }

  private handleGetCheckpoints(payload: Record<string, unknown>, ctx: CommandHandlerContext): void {
    const threadId = typeof payload['thread_id'] === 'string' ? payload['thread_id'] : null;
    if (!threadId) {
      ctx.sendResponse('get_checkpoints', { error: 'thread_id required' });
      return;
    }
    const checkpoints = this.checkpointStore.getByThreadId(threadId);
    ctx.sendResponse('get_checkpoints', { checkpoints });
  }

  private handleForkFromCheckpoint(payload: Record<string, unknown>, ctx: CommandHandlerContext): void {
    const checkpointId = typeof payload['checkpoint_id'] === 'string' ? payload['checkpoint_id'] : null;
    if (!checkpointId) {
      ctx.sendResponse('fork_from_checkpoint', { error: 'checkpoint_id required' });
      return;
    }
    const checkpoint = this.checkpointStore.getById(checkpointId);
    if (!checkpoint) {
      ctx.sendResponse('fork_from_checkpoint', { error: 'Checkpoint not found' });
      return;
    }

    const forkedCheckpoint: Checkpoint = {
      checkpoint_id: uuidv7(),
      thread_id: `${checkpoint.thread_id}:fork:${uuidv7().slice(0, 8)}`,
      agent_id: checkpoint.agent_id,
      swarm_id: checkpoint.swarm_id,
      state: checkpoint.state,
      memory_hierarchy: checkpoint.memory_hierarchy,
      parent_checkpoint_id: checkpoint.checkpoint_id,
      created_at: new Date().toISOString(),
    };
    this.checkpointStore.save(forkedCheckpoint);

    ctx.sendResponse('fork_from_checkpoint', { checkpoint: forkedCheckpoint });
  }

  private handleGetTopology(payload: Record<string, unknown>, ctx: CommandHandlerContext): void {
    const swarmId = typeof payload['swarm_id'] === 'string' ? payload['swarm_id'] : null;
    if (swarmId) {
      const topo = this.topologies.get(swarmId);
      ctx.sendResponse('get_topology', { topology: topo ?? null });
    } else {
      const all = Object.fromEntries(this.topologies);
      ctx.sendResponse('get_topology', { topologies: all });
    }
  }

  private handleGetEvents(payload: Record<string, unknown>, ctx: CommandHandlerContext): void {
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

    if (events.length > limit) {
      events = events.slice(-limit);
    }

    ctx.sendResponse('get_events', { events });
  }

  private handlePauseAll(payload: Record<string, unknown>, ctx: CommandHandlerContext): void {
    const swarmId = typeof payload['swarm_id'] === 'string' ? payload['swarm_id'] : null;
    const pauseEvent: AgentEvent = {
      event_id: uuidv7(),
      swarm_id: swarmId ?? '*',
      agent_id: '*',
      timestamp: new Date().toISOString(),
      event_type: 'agent.paused',
      severity: 'info',
      data: { reason: 'pause_all' },
      protocol_version: '1.0.0',
    };
    this.broadcastToAdapters({ type: 'event', payload: pauseEvent });
    this.ringBuffer.push(pauseEvent);
    this.broadcastToDashboards({ type: 'event', payload: pauseEvent });
    ctx.sendResponse('pause_all', { status: 'ok' });
  }

  private handleResumeAll(payload: Record<string, unknown>, ctx: CommandHandlerContext): void {
    const swarmId = typeof payload['swarm_id'] === 'string' ? payload['swarm_id'] : null;
    const resumeEvent: AgentEvent = {
      event_id: uuidv7(),
      swarm_id: swarmId ?? '*',
      agent_id: '*',
      timestamp: new Date().toISOString(),
      event_type: 'agent.resumed',
      severity: 'info',
      data: { reason: 'resume_all' },
      protocol_version: '1.0.0',
    };
    this.broadcastToAdapters({ type: 'event', payload: resumeEvent });
    this.ringBuffer.push(resumeEvent);
    this.broadcastToDashboards({ type: 'event', payload: resumeEvent });
    ctx.sendResponse('resume_all', { status: 'ok' });
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

  /**
   * Inject an event programmatically (e.g. from built-in demo).
   * Processes through the full pipeline without needing a WebSocket source.
   */
  injectEvent(event: AgentEvent): void {
    this.ringBuffer.push(event);
    this.updateTopology(event);

    if (event.event_type === 'checkpoint.created') {
      this.handleCheckpointCreated(event);
    }

    const matches = this.breakpointController.evaluateEvent(event);
    for (const match of matches) {
      const hitEvent = this.breakpointController.createHitEvent(match);
      this.ringBuffer.push(hitEvent);
      this.broadcastToDashboards({ type: 'event', payload: hitEvent });
    }

    const anomalies = this.anomalyEngine.evaluate(event);
    for (const anomaly of anomalies) {
      this.broadcastToDashboards({ type: 'anomaly', payload: anomaly });
    }

    this.broadcastToDashboards({ type: 'event', payload: event });
    this.otelExporter.exportEvent(event);
  }

  // ── Collaborative sessions ─────────────────────────────────────

  private handleSession(message: SessionMessage, ws: WebSocket): void {
    const { action, user_name, cursor, selected_agent_id } = message.payload;

    if (action === 'join') {
      const sessionId = message.payload.session_id ?? uuidv7().slice(0, 8);
      const color = EventRouter.SESSION_COLORS[this.sessions.size % EventRouter.SESSION_COLORS.length];
      const name = user_name ?? `User ${this.sessions.size + 1}`;
      this.sessions.set(ws, { session_id: sessionId, user_name: name, color });

      // Send join confirmation with all active sessions
      const activeSessions = [...this.sessions.values()];
      this.sendToSocket(ws, {
        type: 'session',
        payload: { action: 'join', session_id: sessionId, user_name: name, color, active_sessions: activeSessions },
      });

      // Broadcast to other dashboards that a new user joined — WITHOUT active_sessions
      this.broadcastSessionToOthers(ws, { action: 'join', session_id: sessionId, user_name: name, color });
    } else if (action === 'leave') {
      this.removeSession(ws);
    } else if (action === 'cursor' || action === 'selection') {
      const session = this.sessions.get(ws);
      if (!session) return;
      this.broadcastSessionToOthers(ws, {
        action,
        session_id: session.session_id,
        user_name: session.user_name,
        color: session.color,
        cursor,
        selected_agent_id,
      });
    }
  }

  /** Remove a session and broadcast leave to other dashboards. */
  removeSession(ws: WebSocket): void {
    const session = this.sessions.get(ws);
    if (session) {
      this.sessions.delete(ws);
      this.broadcastSessionToOthers(ws, {
        action: 'leave',
        session_id: session.session_id,
        user_name: session.user_name,
        color: session.color,
      });
    }
  }

  private broadcastSessionToOthers(sourceWs: WebSocket, payload: SessionPayload): void {
    const data = JSON.stringify({ type: 'session', payload });
    for (const client of this.dashboardClients) {
      if (client !== sourceWs && client.readyState === 1) {
        client.send(data);
      }
    }
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
