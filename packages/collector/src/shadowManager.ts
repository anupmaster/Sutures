/**
 * Shadow Manager — Tracks shadow agent alternate execution paths.
 *
 * Shadow agents run independently from a checkpoint without affecting the real agent.
 * If the shadow's result is better, it can be "promoted" to replace the real agent's state.
 *
 * Shadow agents use InMemorySaver (NOT shared SQLite) for zero contention.
 * Only persist winning shadow path via aupdate_state on promote.
 */

import { v7 as uuidv7 } from 'uuid';
import type { AgentEvent } from './schemas.js';

// ── Types ────────────────────────────────────────────────────────

export type ShadowStatus = 'running' | 'promoted' | 'dismissed';

export interface ShadowEntry {
  shadow_id: string;
  parent_checkpoint_id: string;
  parent_agent_id: string;
  swarm_id: string;
  status: ShadowStatus;
  description?: string;
  events: AgentEvent[];
  spawned_at: string;
  promoted_at?: string;
  dismissed_at?: string;
}

export interface SpawnShadowOptions {
  description?: string;
}

export interface SpawnShadowResult {
  shadow_id: string;
  parent_checkpoint_id: string;
  parent_agent_id: string;
  swarm_id: string;
  status: ShadowStatus;
  spawned_at: string;
}

// ── Shadow Manager ───────────────────────────────────────────────

export class ShadowManager {
  private shadows = new Map<string, ShadowEntry>();

  /**
   * Spawn a shadow agent from a checkpoint.
   * Returns the shadow entry metadata and a shadow.spawned event to broadcast.
   */
  spawnShadow(
    checkpointId: string,
    parentAgentId: string,
    swarmId: string,
    options?: SpawnShadowOptions,
  ): { entry: ShadowEntry; event: AgentEvent } {
    const shadowId = uuidv7();
    const now = new Date().toISOString();

    const entry: ShadowEntry = {
      shadow_id: shadowId,
      parent_checkpoint_id: checkpointId,
      parent_agent_id: parentAgentId,
      swarm_id: swarmId,
      status: 'running',
      description: options?.description,
      events: [],
      spawned_at: now,
    };

    this.shadows.set(shadowId, entry);

    const event: AgentEvent = {
      event_id: uuidv7(),
      swarm_id: swarmId,
      agent_id: `shadow:${shadowId}`,
      timestamp: now,
      event_type: 'agent.spawned',
      severity: 'info',
      data: {
        shadow_id: shadowId,
        parent_checkpoint_id: checkpointId,
        parent_agent_id: parentAgentId,
        is_shadow: true,
        description: options?.description,
      },
      protocol_version: '1.0.0',
    };

    return { entry, event };
  }

  /**
   * Promote a shadow agent — its state replaces the real agent's state.
   * Returns a shadow.promoted-style event to broadcast.
   */
  promoteShadow(shadowId: string): { entry: ShadowEntry; event: AgentEvent } | null {
    const entry = this.shadows.get(shadowId);
    if (!entry || entry.status !== 'running') {
      return null;
    }

    entry.status = 'promoted';
    entry.promoted_at = new Date().toISOString();

    const event: AgentEvent = {
      event_id: uuidv7(),
      swarm_id: entry.swarm_id,
      agent_id: `shadow:${shadowId}`,
      timestamp: entry.promoted_at,
      event_type: 'agent.completed',
      severity: 'info',
      data: {
        shadow_id: shadowId,
        parent_checkpoint_id: entry.parent_checkpoint_id,
        parent_agent_id: entry.parent_agent_id,
        is_shadow: true,
        promoted: true,
      },
      protocol_version: '1.0.0',
    };

    return { entry, event };
  }

  /**
   * Dismiss a shadow agent — discard its alternate path.
   */
  dismissShadow(shadowId: string): { entry: ShadowEntry; event: AgentEvent } | null {
    const entry = this.shadows.get(shadowId);
    if (!entry || entry.status !== 'running') {
      return null;
    }

    entry.status = 'dismissed';
    entry.dismissed_at = new Date().toISOString();

    const event: AgentEvent = {
      event_id: uuidv7(),
      swarm_id: entry.swarm_id,
      agent_id: `shadow:${shadowId}`,
      timestamp: entry.dismissed_at,
      event_type: 'agent.completed',
      severity: 'info',
      data: {
        shadow_id: shadowId,
        parent_checkpoint_id: entry.parent_checkpoint_id,
        parent_agent_id: entry.parent_agent_id,
        is_shadow: true,
        dismissed: true,
      },
      protocol_version: '1.0.0',
    };

    return { entry, event };
  }

  /**
   * List all shadows, optionally filtered by swarm ID.
   */
  listShadows(swarmId?: string): ShadowEntry[] {
    const all = [...this.shadows.values()];
    if (swarmId) {
      return all.filter((s) => s.swarm_id === swarmId);
    }
    return all;
  }

  /**
   * Get a specific shadow by ID.
   */
  getShadow(shadowId: string): ShadowEntry | undefined {
    return this.shadows.get(shadowId);
  }

  /**
   * Add an event to a shadow's event log.
   */
  addEvent(shadowId: string, event: AgentEvent): void {
    const entry = this.shadows.get(shadowId);
    if (entry) {
      entry.events.push(event);
    }
  }
}
