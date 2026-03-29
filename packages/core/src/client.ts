import { v7 as uuidv7 } from 'uuid';
import type {
  AgentEvent,
  AgentEventType,
  AgentEventDataMap,
  AdapterEventMessage,
  BreakpointCondition,
  BreakpointConfig,
  BreakpointHitData,
  BreakpointParams,
  Severity,
  SuturesClientConfig,
} from './types.js';

// ----------------------------------------------------------------------------
// Defaults
// ----------------------------------------------------------------------------

const DEFAULT_URL = 'ws://localhost:9470/v1/events';
const DEFAULT_BUFFER_LIMIT = 1000;
const DEFAULT_MAX_RECONNECT_DELAY = 30_000;
const INITIAL_RECONNECT_DELAY = 1000;

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------

function isoMicrosecond(): string {
  const now = new Date();
  return now.toISOString().replace('Z', '000Z');
}

function makeEvent<K extends AgentEventType>(
  eventType: K,
  data: AgentEventDataMap[K],
  context: { swarm_id: string; agent_id: string; parent_agent_id?: string },
  severity: Severity = 'info',
  duration_ms?: number,
): AgentEvent<AgentEventDataMap[K]> {
  return {
    event_id: uuidv7(),
    swarm_id: context.swarm_id,
    agent_id: context.agent_id,
    parent_agent_id: context.parent_agent_id,
    timestamp: isoMicrosecond(),
    duration_ms,
    event_type: eventType,
    severity,
    data,
    protocol_version: '1.0.0',
  };
}

// ----------------------------------------------------------------------------
// WebSocket abstraction (Node.js + Browser)
// ----------------------------------------------------------------------------

type SocketLike = {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev: unknown) => void) | null;
  onclose: ((ev: unknown) => void) | null;
  onerror: ((ev: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
};

const OPEN = 1;

function createSocket(url: string): SocketLike {
  // Browser or environments with global WebSocket (Deno, Bun, etc.)
  if (typeof WebSocket !== 'undefined') {
    return new WebSocket(url) as unknown as SocketLike;
  }
  // Will throw at runtime if no WebSocket implementation is available.
  // Node users should install 'ws' — the adapter packages handle this.
  throw new Error(
    'No WebSocket implementation found. Install the "ws" package or run in a browser environment.',
  );
}

// ----------------------------------------------------------------------------
// Breakpoint handler type
// ----------------------------------------------------------------------------

export type BreakpointHandler = (hit: BreakpointHitData) => void | Promise<void>;

// ----------------------------------------------------------------------------
// SuturesClient
// ----------------------------------------------------------------------------

/**
 * WebSocket client that streams AgentEvents to a Sutures collector.
 *
 * Features:
 * - Auto-reconnect with exponential backoff (1s -> 2s -> 4s -> max 30s)
 * - Event buffering while disconnected (up to `buffer_limit` events)
 * - Typed convenience emitters for all 32 event types
 * - Breakpoint handler registration
 */
export class SuturesClient {
  private readonly url: string;
  private readonly swarmId: string;
  private readonly agentId: string;
  private readonly parentAgentId?: string;
  private readonly bufferLimit: number;
  private readonly maxReconnectDelay: number;
  private readonly autoReconnect: boolean;

  private socket: SocketLike | null = null;
  private buffer: string[] = [];
  private reconnectDelay = INITIAL_RECONNECT_DELAY;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;
  private breakpointHandler: BreakpointHandler | null = null;

  constructor(config: SuturesClientConfig = {}) {
    this.url = config.url ?? DEFAULT_URL;
    this.swarmId = config.swarm_id ?? uuidv7();
    this.agentId = config.agent_id ?? uuidv7();
    this.parentAgentId = config.parent_agent_id;
    this.bufferLimit = config.buffer_limit ?? DEFAULT_BUFFER_LIMIT;
    this.maxReconnectDelay = config.max_reconnect_delay_ms ?? DEFAULT_MAX_RECONNECT_DELAY;
    this.autoReconnect = config.auto_reconnect ?? true;
  }

  // ---------- Connection lifecycle ----------

  /** Open the WebSocket connection to the collector. */
  connect(): void {
    if (this.socket && this.socket.readyState === OPEN) return;
    this.intentionallyClosed = false;
    this.socket = createSocket(this.url);

    this.socket.onopen = () => {
      this.reconnectDelay = INITIAL_RECONNECT_DELAY;
      this.flushBuffer();
    };

    this.socket.onclose = () => {
      if (!this.intentionallyClosed && this.autoReconnect) {
        this.scheduleReconnect();
      }
    };

    this.socket.onerror = () => {
      // onclose will fire after onerror; reconnect is handled there.
    };

    this.socket.onmessage = (ev: { data: unknown }) => {
      this.handleIncomingMessage(ev.data);
    };
  }

  /** Gracefully close the connection and flush the buffer. */
  async disconnect(): Promise<void> {
    this.intentionallyClosed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }

  /** Whether the WebSocket is currently open. */
  get connected(): boolean {
    return this.socket !== null && this.socket.readyState === OPEN;
  }

  /** Number of events currently buffered. */
  get bufferedCount(): number {
    return this.buffer.length;
  }

  /** The swarm_id (trace ID) for this session. */
  get swarm(): string {
    return this.swarmId;
  }

  /** The agent_id for this client. */
  get agent(): string {
    return this.agentId;
  }

  // ---------- Breakpoint handling ----------

  /** Register a handler that is called when a breakpoint.hit event arrives from the collector. */
  onBreakpointHit(handler: BreakpointHandler): void {
    this.breakpointHandler = handler;
  }

  // ---------- Low-level send ----------

  /** Send a raw AgentEvent. Prefer the typed convenience methods. */
  send<T>(event: AgentEvent<T>): void {
    const message: AdapterEventMessage = { type: 'event', payload: event as AgentEvent };
    const serialized = JSON.stringify(message);

    if (this.connected && this.socket) {
      this.socket.send(serialized);
    } else {
      if (this.buffer.length >= this.bufferLimit) {
        this.buffer.shift(); // drop oldest
      }
      this.buffer.push(serialized);
    }
  }

  /** Emit a typed event using one of the 32 event types. */
  emit<K extends AgentEventType>(
    eventType: K,
    data: AgentEventDataMap[K],
    options?: { severity?: Severity; duration_ms?: number; agent_id?: string; parent_agent_id?: string },
  ): AgentEvent<AgentEventDataMap[K]> {
    const event = makeEvent(eventType, data, {
      swarm_id: this.swarmId,
      agent_id: options?.agent_id ?? this.agentId,
      parent_agent_id: options?.parent_agent_id ?? this.parentAgentId,
    }, options?.severity, options?.duration_ms);
    this.send(event);
    return event;
  }

  // ---------- Convenience emitters: Lifecycle ----------

  agentSpawned(data: AgentEventDataMap['agent.spawned']) {
    return this.emit('agent.spawned', data);
  }

  agentIdle(data: AgentEventDataMap['agent.idle']) {
    return this.emit('agent.idle', data);
  }

  agentCompleted(data: AgentEventDataMap['agent.completed']) {
    return this.emit('agent.completed', data);
  }

  agentFailed(data: AgentEventDataMap['agent.failed'], severity: Severity = 'error') {
    return this.emit('agent.failed', data, { severity });
  }

  agentPaused(data: AgentEventDataMap['agent.paused']) {
    return this.emit('agent.paused', data);
  }

  agentResumed(data: AgentEventDataMap['agent.resumed']) {
    return this.emit('agent.resumed', data);
  }

  // ---------- Convenience emitters: Reasoning ----------

  turnStarted(data: AgentEventDataMap['turn.started']) {
    return this.emit('turn.started', data);
  }

  turnThinking(data: AgentEventDataMap['turn.thinking']) {
    return this.emit('turn.thinking', data, { severity: 'debug' });
  }

  turnThought(data: AgentEventDataMap['turn.thought']) {
    return this.emit('turn.thought', data, { severity: 'debug' });
  }

  turnActing(data: AgentEventDataMap['turn.acting']) {
    return this.emit('turn.acting', data);
  }

  turnObserved(data: AgentEventDataMap['turn.observed']) {
    return this.emit('turn.observed', data);
  }

  turnCompleted(data: AgentEventDataMap['turn.completed'], duration_ms?: number) {
    return this.emit('turn.completed', data, { duration_ms });
  }

  turnFailed(data: AgentEventDataMap['turn.failed'], severity: Severity = 'error') {
    return this.emit('turn.failed', data, { severity });
  }

  // ---------- Convenience emitters: Collaboration ----------

  handoffInitiated(data: AgentEventDataMap['handoff.initiated']) {
    return this.emit('handoff.initiated', data);
  }

  handoffAccepted(data: AgentEventDataMap['handoff.accepted']) {
    return this.emit('handoff.accepted', data);
  }

  handoffRejected(data: AgentEventDataMap['handoff.rejected'], severity: Severity = 'warn') {
    return this.emit('handoff.rejected', data, { severity });
  }

  handoffCompleted(data: AgentEventDataMap['handoff.completed']) {
    return this.emit('handoff.completed', data);
  }

  // ---------- Convenience emitters: Memory & State ----------

  memoryWrite(data: AgentEventDataMap['memory.write']) {
    return this.emit('memory.write', data);
  }

  memoryRead(data: AgentEventDataMap['memory.read']) {
    return this.emit('memory.read', data, { severity: 'debug' });
  }

  checkpointCreated(data: AgentEventDataMap['checkpoint.created']) {
    return this.emit('checkpoint.created', data);
  }

  // ---------- Convenience emitters: Intervention ----------

  breakpointSet(data: AgentEventDataMap['breakpoint.set']) {
    return this.emit('breakpoint.set', data);
  }

  breakpointHit(data: AgentEventDataMap['breakpoint.hit'], severity: Severity = 'warn') {
    return this.emit('breakpoint.hit', data, { severity });
  }

  breakpointInject(data: AgentEventDataMap['breakpoint.inject']) {
    return this.emit('breakpoint.inject', data);
  }

  breakpointRelease(data: AgentEventDataMap['breakpoint.release']) {
    return this.emit('breakpoint.release', data);
  }

  // ---------- Convenience emitters: Cost ----------

  costTokens(data: AgentEventDataMap['cost.tokens']) {
    return this.emit('cost.tokens', data);
  }

  costApiCall(data: AgentEventDataMap['cost.api_call']) {
    return this.emit('cost.api_call', data);
  }

  // ---------- Convenience emitters: Memory Extensions ----------

  memoryTierMigration(data: AgentEventDataMap['memory.tier_migration']) {
    return this.emit('memory.tier_migration', data);
  }

  memoryConflict(data: AgentEventDataMap['memory.conflict'], severity: Severity = 'warn') {
    return this.emit('memory.conflict', data, { severity });
  }

  memoryPrune(data: AgentEventDataMap['memory.prune']) {
    return this.emit('memory.prune', data);
  }

  memoryReconsolidate(data: AgentEventDataMap['memory.reconsolidate']) {
    return this.emit('memory.reconsolidate', data);
  }

  memoryStructureSwitch(data: AgentEventDataMap['memory.structure_switch']) {
    return this.emit('memory.structure_switch', data);
  }

  memoryCoherenceViolation(data: AgentEventDataMap['memory.coherence_violation'], severity: Severity = 'error') {
    return this.emit('memory.coherence_violation', data, { severity });
  }

  // ---------- Internal ----------

  private flushBuffer(): void {
    if (!this.connected || !this.socket) return;
    while (this.buffer.length > 0) {
      const msg = this.buffer.shift()!;
      this.socket.send(msg);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
      this.connect();
    }, this.reconnectDelay);
  }

  private handleIncomingMessage(raw: unknown): void {
    try {
      const text = typeof raw === 'string' ? raw : String(raw);
      const parsed = JSON.parse(text) as Record<string, unknown>;

      // If this is a breakpoint.hit event relayed from the collector, invoke handler.
      if (
        parsed['type'] === 'event' &&
        typeof parsed['payload'] === 'object' &&
        parsed['payload'] !== null
      ) {
        const payload = parsed['payload'] as Record<string, unknown>;
        if (payload['event_type'] === 'breakpoint.hit' && this.breakpointHandler) {
          void this.breakpointHandler(payload['data'] as BreakpointHitData);
        }
      }
    } catch {
      // Malformed messages are silently dropped. Adapters should not crash.
    }
  }
}

// ----------------------------------------------------------------------------
// Factory
// ----------------------------------------------------------------------------

/** Create a new SuturesClient with optional configuration. */
export function createSutures(config?: SuturesClientConfig): SuturesClient {
  return new SuturesClient(config);
}
