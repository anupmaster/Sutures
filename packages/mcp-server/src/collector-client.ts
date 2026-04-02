/**
 * Collector Client — HTTP + WebSocket client that connects to the Sutures Collector.
 *
 * HTTP (port 9471): REST queries for topology, events, checkpoints, breakpoints.
 * WebSocket (port 9470): Real-time commands and event streaming via /v1/dashboard.
 */

import WebSocket from 'ws';
import type {
  AgentEvent,
  BreakpointConfig,
  Checkpoint,
  CheckpointsResponse,
  CollectorHealthResponse,
  EventsResponse,
  SwarmTopology,
  TopologyResponse,
  WsCommand,
  WsInboundMessage,
  WsResponse,
} from './types.js';

// ── Configuration ────────────────────────────────────────────────

const DEFAULT_HTTP_URL = 'http://localhost:9471';
const DEFAULT_WS_URL = 'ws://localhost:9470/v1/dashboard';

const HTTP_TIMEOUT_MS = 10_000;
const HTTP_RETRY_ATTEMPTS = 2;
const HTTP_RETRY_DELAY_MS = 500;

const WS_RECONNECT_DELAY_MS = 3_000;
const WS_COMMAND_TIMEOUT_MS = 15_000;

// ── Pending Command Tracking ─────────────────────────────────────

interface PendingCommand {
  resolve: (data: Record<string, unknown>) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

// ── Collector Client ─────────────────────────────────────────────

export class CollectorClient {
  private readonly httpUrl: string;
  private readonly wsUrl: string;
  private ws: WebSocket | null = null;
  private wsConnected = false;
  private wsReconnecting = false;
  private pendingCommands = new Map<string, PendingCommand>();
  private eventListeners: Array<(event: AgentEvent) => void> = [];
  private commandCounter = 0;

  constructor(httpUrl?: string, wsUrl?: string) {
    this.httpUrl = httpUrl
      ?? process.env['SUTURES_COLLECTOR_HTTP']
      ?? DEFAULT_HTTP_URL;
    this.wsUrl = wsUrl
      ?? process.env['SUTURES_COLLECTOR_WS']
      ?? DEFAULT_WS_URL;
  }

  // ── HTTP Methods ─────────────────────────────────────────────

  /**
   * Make an HTTP GET request to the collector with retry logic.
   */
  async httpGet<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(path, this.httpUrl);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== '') {
          url.searchParams.set(key, value);
        }
      }
    }

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= HTTP_RETRY_ATTEMPTS; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return (await response.json()) as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < HTTP_RETRY_ATTEMPTS) {
          await this.sleep(HTTP_RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    throw lastError ?? new Error('HTTP request failed');
  }

  /**
   * Make an HTTP POST request to the collector with retry logic.
   */
  async httpPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const url = new URL(path, this.httpUrl);

    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= HTTP_RETRY_ATTEMPTS; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);

        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return (await response.json()) as T;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (attempt < HTTP_RETRY_ATTEMPTS) {
          await this.sleep(HTTP_RETRY_DELAY_MS * (attempt + 1));
        }
      }
    }

    throw lastError ?? new Error('HTTP POST request failed');
  }

  async getHealth(): Promise<CollectorHealthResponse> {
    return this.httpGet<CollectorHealthResponse>('/health');
  }

  async getTopology(swarmId?: string): Promise<TopologyResponse> {
    const params: Record<string, string> = {};
    if (swarmId) params['swarm_id'] = swarmId;
    return this.httpGet<TopologyResponse>('/api/topology', params);
  }

  async getEvents(options?: {
    swarm_id?: string;
    agent_id?: string;
    limit?: number;
  }): Promise<EventsResponse> {
    const params: Record<string, string> = {};
    if (options?.swarm_id) params['swarm_id'] = options.swarm_id;
    if (options?.agent_id) params['agent_id'] = options.agent_id;
    if (options?.limit !== undefined) params['limit'] = String(options.limit);
    return this.httpGet<EventsResponse>('/api/events', params);
  }

  async getCheckpoints(threadId: string): Promise<CheckpointsResponse> {
    return this.httpGet<CheckpointsResponse>('/api/checkpoints', {
      thread_id: threadId,
    });
  }

  async getBreakpoints(): Promise<{ breakpoints: BreakpointConfig[] }> {
    return this.httpGet<{ breakpoints: BreakpointConfig[] }>('/api/breakpoints');
  }

  // ── WebSocket Methods ────────────────────────────────────────

  /**
   * Ensure the WebSocket is connected. Returns immediately if already connected.
   */
  async ensureWebSocket(): Promise<void> {
    if (this.wsConnected && this.ws?.readyState === WebSocket.OPEN) {
      return;
    }
    await this.connectWebSocket();
  }

  private connectWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws) {
        this.ws.removeAllListeners();
        if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
        }
      }

      this.ws = new WebSocket(this.wsUrl);

      this.ws.on('open', () => {
        this.wsConnected = true;
        this.wsReconnecting = false;
        resolve();
      });

      this.ws.on('message', (data: WebSocket.Data) => {
        this.handleWsMessage(data);
      });

      this.ws.on('close', () => {
        this.wsConnected = false;
        this.rejectAllPending('WebSocket connection closed');
        this.scheduleReconnect();
      });

      this.ws.on('error', (err: Error) => {
        this.wsConnected = false;
        if (!this.wsReconnecting) {
          reject(err);
        }
        this.scheduleReconnect();
      });
    });
  }

  private handleWsMessage(data: WebSocket.Data): void {
    let message: WsInboundMessage;
    try {
      const raw = typeof data === 'string' ? data : data.toString('utf-8');
      message = JSON.parse(raw) as WsInboundMessage;
    } catch {
      return;
    }

    if (message.type === 'response') {
      const response = message as WsResponse;
      const pending = this.pendingCommands.get(response.command);
      if (pending) {
        clearTimeout(pending.timer);
        this.pendingCommands.delete(response.command);
        pending.resolve(response.data);
      }
    } else if (message.type === 'event') {
      for (const listener of this.eventListeners) {
        try {
          listener(message.payload);
        } catch {
          // Swallow listener errors
        }
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.wsReconnecting) return;
    this.wsReconnecting = true;
    setTimeout(() => {
      this.connectWebSocket().catch(() => {
        // Reconnect failed, will retry on next command
        this.wsReconnecting = false;
      });
    }, WS_RECONNECT_DELAY_MS);
  }

  private rejectAllPending(reason: string): void {
    for (const [key, pending] of this.pendingCommands) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
      this.pendingCommands.delete(key);
    }
  }

  /**
   * Send a command over WebSocket and wait for the response.
   */
  async sendCommand(
    command: string,
    payload: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    await this.ensureWebSocket();

    // Use a unique command key to avoid collisions when sending the same command type
    const commandKey = `${command}:${this.commandCounter++}`;

    const wsCommand: WsCommand = {
      type: 'command',
      command,
      payload,
    };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingCommands.delete(command);
        reject(new Error(`Command '${command}' timed out after ${WS_COMMAND_TIMEOUT_MS}ms`));
      }, WS_COMMAND_TIMEOUT_MS);

      // Store under the original command name since the collector responds with
      // the command name, not our internal key.
      this.pendingCommands.set(command, { resolve, reject, timer });

      this.ws?.send(JSON.stringify(wsCommand), (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingCommands.delete(command);
          reject(err);
        }
      });
    });
  }

  /**
   * Register a listener for real-time agent events.
   */
  onEvent(listener: (event: AgentEvent) => void): () => void {
    this.eventListeners.push(listener);
    return () => {
      const idx = this.eventListeners.indexOf(listener);
      if (idx >= 0) this.eventListeners.splice(idx, 1);
    };
  }

  /**
   * Gracefully close the WebSocket connection.
   */
  async disconnect(): Promise<void> {
    this.wsReconnecting = false;
    this.rejectAllPending('Client disconnecting');
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.wsConnected = false;
  }

  // ── Convenience Methods ──────────────────────────────────────

  /**
   * Get all topologies, resolving each swarm's agent list.
   */
  async getAllTopologies(): Promise<Record<string, SwarmTopology>> {
    const resp = await this.getTopology();
    if (resp.topologies) return resp.topologies;
    if (resp.topology) {
      return { [resp.topology.swarm_id]: resp.topology };
    }
    return {};
  }

  /**
   * Get all events for a specific agent.
   */
  async getAgentEvents(agentId: string, limit = 200): Promise<AgentEvent[]> {
    const resp = await this.getEvents({ agent_id: agentId, limit });
    return resp.events;
  }

  /**
   * Get all events for a swarm.
   */
  async getSwarmEvents(swarmId: string, limit = 500): Promise<AgentEvent[]> {
    const resp = await this.getEvents({ swarm_id: swarmId, limit });
    return resp.events;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
