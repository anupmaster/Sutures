/**
 * Collector client — WebSocket connection to the Sutures collector server.
 *
 * Connects to ws://host:port/v1/dashboard to receive real-time agent events,
 * topology updates, and anomaly alerts.
 */

import * as vscode from 'vscode';
import WebSocket from 'ws';

// ── Types mirrored from collector schemas ────────────────────────

export type AgentStatus =
  | 'spawned'
  | 'idle'
  | 'thinking'
  | 'acting'
  | 'observing'
  | 'completed'
  | 'failed'
  | 'paused';

export interface AgentEvent {
  event_id: string;
  swarm_id: string;
  agent_id: string;
  parent_agent_id?: string;
  timestamp: string;
  duration_ms?: number;
  event_type: string;
  severity: string;
  data: Record<string, unknown>;
  protocol_version: string;
}

export interface TopologyAgent {
  agent_id: string;
  parent_agent_id?: string;
  status: AgentStatus;
  name?: string;
  model?: string;
  spawned_at: string;
  completed_at?: string;
}

export interface SwarmTopology {
  swarm_id: string;
  agents: Record<string, TopologyAgent>;
  edges: Array<{
    from_agent_id: string;
    to_agent_id: string;
    type: string;
    timestamp: string;
  }>;
  updated_at: string;
}

export interface OutboundMessage {
  type: 'event' | 'topology' | 'anomaly' | 'response' | 'session';
  payload?: unknown;
  command?: string;
  data?: unknown;
}

// ── Event emitter for the extension ──────────────────────────────

export type CollectorEventHandler = {
  onEvent: (event: AgentEvent) => void;
  onTopology: (topology: SwarmTopology) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onError: (error: string) => void;
};

// ── Collector Client ─────────────────────────────────────────────

export class CollectorClient {
  private ws: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _connected = false;
  private handlers: CollectorEventHandler;

  /** All topologies by swarm_id */
  public topologies = new Map<string, SwarmTopology>();

  /** Recent events per agent (last 200 per agent) */
  public agentEvents = new Map<string, AgentEvent[]>();

  /** All agents from topology */
  public agents = new Map<string, TopologyAgent & { swarm_id: string }>();

  constructor(handlers: CollectorEventHandler) {
    this.handlers = handlers;
  }

  get connected(): boolean {
    return this._connected;
  }

  get agentCount(): number {
    return this.agents.size;
  }

  get activeAgentCount(): number {
    let count = 0;
    for (const agent of this.agents.values()) {
      if (
        agent.status === 'thinking' ||
        agent.status === 'acting' ||
        agent.status === 'observing' ||
        agent.status === 'idle' ||
        agent.status === 'spawned'
      ) {
        count++;
      }
    }
    return count;
  }

  connect(): void {
    if (this.ws) {
      this.disconnect();
    }

    const config = vscode.workspace.getConfiguration('sutures');
    const host = config.get<string>('collectorHost', 'localhost');
    const port = config.get<number>('collectorWsPort', 9470);
    const url = `ws://${host}:${port}/v1/dashboard`;

    try {
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        this._connected = true;
        this.handlers.onConnected();
      });

      this.ws.on('message', (data) => {
        try {
          const raw = typeof data === 'string' ? data : data.toString('utf-8');
          const msg: OutboundMessage = JSON.parse(raw);
          this.handleMessage(msg);
        } catch {
          // Ignore malformed messages
        }
      });

      this.ws.on('close', () => {
        this._connected = false;
        this.ws = null;
        this.handlers.onDisconnected();
      });

      this.ws.on('error', (err) => {
        this._connected = false;
        this.handlers.onError(err.message);
        this.ws?.close();
        this.ws = null;
      });
    } catch (err) {
      this.handlers.onError(
        err instanceof Error ? err.message : 'Failed to connect'
      );
    }
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this._connected = false;
    this.handlers.onDisconnected();
  }

  /** Send a command to the collector (e.g. set_breakpoint) */
  sendCommand(command: string, payload?: Record<string, unknown>): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      vscode.window.showWarningMessage(
        'Sutures: Not connected to collector.'
      );
      return;
    }
    this.ws.send(
      JSON.stringify({ type: 'command', command, payload: payload ?? {} })
    );
  }

  /** Clear all cached state */
  reset(): void {
    this.topologies.clear();
    this.agentEvents.clear();
    this.agents.clear();
  }

  // ── Message handler ────────────────────────────────────────────

  private handleMessage(msg: OutboundMessage): void {
    switch (msg.type) {
      case 'topology':
        this.handleTopology(msg.payload as SwarmTopology);
        break;
      case 'event':
        this.handleEvent(msg.payload as AgentEvent);
        break;
      // anomaly, response, session — ignored for now
    }
  }

  private handleTopology(topology: SwarmTopology): void {
    this.topologies.set(topology.swarm_id, topology);

    // Update agents map
    for (const [agentId, agent] of Object.entries(topology.agents)) {
      this.agents.set(agentId, { ...agent, swarm_id: topology.swarm_id });
    }

    this.handlers.onTopology(topology);
  }

  private handleEvent(event: AgentEvent): void {
    // Track events per agent
    const events = this.agentEvents.get(event.agent_id) ?? [];
    events.push(event);
    // Keep last 200
    if (events.length > 200) {
      events.splice(0, events.length - 200);
    }
    this.agentEvents.set(event.agent_id, events);

    // Update agent status from lifecycle events
    this.updateAgentStatus(event);

    this.handlers.onEvent(event);
  }

  private updateAgentStatus(event: AgentEvent): void {
    const existing = this.agents.get(event.agent_id);

    const statusMap: Record<string, AgentStatus> = {
      'agent.spawned': 'spawned',
      'agent.idle': 'idle',
      'agent.completed': 'completed',
      'agent.failed': 'failed',
      'agent.paused': 'paused',
      'agent.resumed': 'idle',
      'turn.started': 'idle',
      'turn.thinking': 'thinking',
      'turn.thought': 'thinking',
      'turn.acting': 'acting',
      'turn.observed': 'observing',
      'turn.completed': 'idle',
      'turn.failed': 'failed',
    };

    const newStatus = statusMap[event.event_type];
    if (!newStatus) return;

    if (existing) {
      existing.status = newStatus;
    } else {
      // Agent not yet in topology — create a stub
      this.agents.set(event.agent_id, {
        agent_id: event.agent_id,
        parent_agent_id: event.parent_agent_id,
        status: newStatus,
        name: (event.data['name'] as string) ?? event.agent_id,
        model: event.data['model'] as string | undefined,
        spawned_at: event.timestamp,
        swarm_id: event.swarm_id,
      });
    }
  }
}
