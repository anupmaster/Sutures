/**
 * Ring Buffer — Fixed-size circular buffer for AgentEvents.
 *
 * O(1) append, O(n) search by swarm_id or agent_id.
 * Events older than buffer capacity are only available via OTEL export.
 */

import type { AgentEvent } from './schemas.js';

const DEFAULT_CAPACITY = 10_000;

export class RingBuffer {
  private readonly buffer: Array<AgentEvent | null>;
  private readonly capacity: number;
  private head = 0;
  private count = 0;

  constructor(capacity: number = DEFAULT_CAPACITY) {
    if (capacity < 1) {
      throw new Error('RingBuffer capacity must be at least 1');
    }
    this.capacity = capacity;
    this.buffer = new Array<AgentEvent | null>(capacity).fill(null);
  }

  /** Append an event. O(1). Overwrites oldest event when full. */
  push(event: AgentEvent): void {
    this.buffer[this.head] = event;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    }
  }

  /** Get all events for a given swarm_id. O(n). */
  getBySwarmId(swarmId: string): AgentEvent[] {
    return this.scan((e) => e.swarm_id === swarmId);
  }

  /** Get all events for a given agent_id. O(n). */
  getByAgentId(agentId: string): AgentEvent[] {
    return this.scan((e) => e.agent_id === agentId);
  }

  /** Get the most recent `n` events in chronological order. */
  getRecent(n: number): AgentEvent[] {
    const limit = Math.min(n, this.count);
    const result: AgentEvent[] = [];
    for (let i = 0; i < limit; i++) {
      const idx = (this.head - limit + i + this.capacity) % this.capacity;
      const event = this.buffer[idx];
      if (event !== null) {
        result.push(event);
      }
    }
    return result;
  }

  /** Get all stored events in chronological order. */
  getAll(): AgentEvent[] {
    return this.getRecent(this.count);
  }

  /** Current number of stored events. */
  get size(): number {
    return this.count;
  }

  /** Clear all events. */
  clear(): void {
    this.buffer.fill(null);
    this.head = 0;
    this.count = 0;
  }

  /** Internal scan with predicate, returns results in chronological order. */
  private scan(predicate: (e: AgentEvent) => boolean): AgentEvent[] {
    const result: AgentEvent[] = [];
    const start = this.count < this.capacity ? 0 : this.head;
    for (let i = 0; i < this.count; i++) {
      const idx = (start + i) % this.capacity;
      const event = this.buffer[idx];
      if (event !== null && predicate(event)) {
        result.push(event);
      }
    }
    return result;
  }
}
