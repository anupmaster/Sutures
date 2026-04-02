/**
 * Breakpoint Controller — Manages breakpoint lifecycle and evaluation.
 *
 * Supports 13 condition types. When an event matches a breakpoint,
 * the collector emits a `breakpoint.hit` event back to the adapter and dashboard.
 */

import { v7 as uuidv7 } from 'uuid';
import type {
  AgentEvent,
  BreakpointConfig,
  BreakpointConditionType,
} from './schemas.js';

export interface BreakpointMatch {
  breakpoint: BreakpointConfig;
  event: AgentEvent;
}

export interface InjectionPayload {
  agent_id: string;
  state?: Record<string, unknown>;
  messages?: Array<Record<string, unknown>>;
  resume: boolean;
}

export class BreakpointController {
  private breakpoints = new Map<string, BreakpointConfig>();

  /** Register a new breakpoint. Returns the breakpoint ID. */
  setBreakpoint(config: BreakpointConfig): string {
    const id = config.breakpoint_id ?? uuidv7();
    const bp: BreakpointConfig = { ...config, breakpoint_id: id };
    this.breakpoints.set(id, bp);
    return id;
  }

  /** Remove a breakpoint by ID. Returns true if it existed. */
  releaseBreakpoint(id: string): boolean {
    return this.breakpoints.delete(id);
  }

  /** Get all active breakpoints. */
  getAll(): BreakpointConfig[] {
    return Array.from(this.breakpoints.values());
  }

  /** Get a breakpoint by ID. */
  getById(id: string): BreakpointConfig | undefined {
    return this.breakpoints.get(id);
  }

  /**
   * Evaluate an event against all active breakpoints.
   * Returns list of matched breakpoints. Single-shot breakpoints are auto-removed.
   */
  evaluateEvent(event: AgentEvent): BreakpointMatch[] {
    const matches: BreakpointMatch[] = [];

    for (const [id, bp] of this.breakpoints) {
      // Check agent_id / swarm_id scope filters
      if (bp.agent_id && bp.agent_id !== event.agent_id) continue;
      if (bp.swarm_id && bp.swarm_id !== event.swarm_id) continue;

      if (this.matchesCondition(bp.condition, bp.value, event)) {
        matches.push({ breakpoint: bp, event });

        // Auto-remove single-shot breakpoints
        if (bp.once) {
          this.breakpoints.delete(id);
        }
      }
    }

    return matches;
  }

  /**
   * Create a `breakpoint.hit` AgentEvent to be sent back to the adapter and dashboard.
   */
  createHitEvent(match: BreakpointMatch): AgentEvent {
    return {
      event_id: uuidv7(),
      swarm_id: match.event.swarm_id,
      agent_id: match.event.agent_id,
      parent_agent_id: match.event.parent_agent_id,
      timestamp: new Date().toISOString(),
      event_type: 'breakpoint.hit',
      severity: 'info',
      data: {
        breakpoint_id: match.breakpoint.breakpoint_id,
        condition: match.breakpoint.condition,
        triggering_event_id: match.event.event_id,
        triggering_event_type: match.event.event_type,
      },
      protocol_version: '1.0.0',
    };
  }

  /**
   * Prepare an injection payload for resuming an agent with modified state.
   */
  prepareInjection(payload: InjectionPayload): AgentEvent {
    return {
      event_id: uuidv7(),
      swarm_id: '', // Caller fills in the correct swarm_id
      agent_id: payload.agent_id,
      timestamp: new Date().toISOString(),
      event_type: 'breakpoint.inject',
      severity: 'info',
      data: {
        state: payload.state,
        messages: payload.messages,
        resume: payload.resume,
      },
      protocol_version: '1.0.0',
    };
  }

  /** Clear all breakpoints. */
  clear(): void {
    this.breakpoints.clear();
  }

  private matchesCondition(
    condition: BreakpointConditionType,
    value: unknown,
    event: AgentEvent,
  ): boolean {
    switch (condition) {
      case 'always':
        return true;

      case 'on_turn': {
        if (event.event_type !== 'turn.started') return false;
        if (value != null && typeof value === 'number') {
          const turnNumber = extractNumber(event.data, 'turn_number');
          return turnNumber != null && turnNumber === value;
        }
        return true;
      }

      case 'on_tool':
        if (event.event_type !== 'turn.acting') return false;
        if (value != null && typeof value === 'string') {
          const toolName = extractString(event.data, 'tool_name');
          return toolName === value;
        }
        return true;

      case 'on_handoff':
        return event.event_type.startsWith('handoff.');

      case 'on_cost': {
        if (event.event_type !== 'cost.api_call' && event.event_type !== 'cost.tokens') return false;
        if (value != null && typeof value === 'number') {
          const costUsd = extractNumber(event.data, 'cumulative_cost_usd') ?? extractNumber(event.data, 'cost_usd');
          return costUsd != null && costUsd >= value;
        }
        return true;
      }

      case 'on_error':
        return event.event_type === 'agent.failed' || event.event_type === 'turn.failed';

      case 'on_score': {
        if (event.event_type !== 'turn.observed') return false;
        if (value != null && typeof value === 'number') {
          const score = extractNumber(event.data, 'score');
          return score != null && score <= value;
        }
        return event.event_type === 'turn.observed';
      }

      case 'on_memory_tier_migration':
        return event.event_type === 'memory.tier_migration';

      case 'on_conflict_detected':
        return event.event_type === 'memory.conflict';

      case 'on_context_pressure': {
        if (event.event_type !== 'turn.started') return false;
        if (value != null && typeof value === 'number') {
          const contextTokens = extractNumber(event.data, 'context_tokens');
          return contextTokens != null && contextTokens >= value;
        }
        return false;
      }

      case 'on_memory_structure_switch':
        return event.event_type === 'memory.structure_switch';

      case 'on_memory_link_created':
        return event.event_type === 'memory.write' &&
          extractString(event.data, 'operation') === 'link';

      case 'on_cache_coherence_violation':
        return event.event_type === 'memory.coherence_violation';

      default:
        return false;
    }
  }
}

function extractString(data: Record<string, unknown>, key: string): string | null {
  const val = data[key];
  return typeof val === 'string' ? val : null;
}

function extractNumber(data: Record<string, unknown>, key: string): number | null {
  const val = data[key];
  return typeof val === 'number' ? val : null;
}
