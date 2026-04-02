/**
 * Anomaly Engine — Real-time anomaly detection for multi-agent systems.
 *
 * Detects 4 patterns:
 * 1. Infinite loops: 3+ identical consecutive tool calls by same agent
 * 2. Cost spikes: agent cost > 3x running average
 * 3. Context bloat: context growth > 10% per turn
 * 4. Handoff cycles: A->B->A->B pattern detected
 */

import type { AgentEvent, AnomalyAlert } from './schemas.js';
import { DetectorRegistry, type AnomalyDetector } from './detectorRegistry.js';

/** Tracks recent tool calls per agent for loop detection. */
interface ToolCallTracker {
  /** Recent tool names in call order. */
  recentTools: string[];
}

/** Tracks cumulative cost per agent for spike detection. */
interface CostTracker {
  costs: number[];
  total: number;
}

/** Tracks context size per agent per turn for bloat detection. */
interface ContextTracker {
  sizes: number[];
}

/** Tracks handoff sequence for cycle detection. */
interface HandoffTracker {
  /** Sequence of (from, to) agent IDs. */
  sequence: Array<{ from: string; to: string }>;
}

const LOOP_THRESHOLD = 3;
const COST_SPIKE_MULTIPLIER = 3;
const CONTEXT_BLOAT_RATE = 0.10;
const HANDOFF_CYCLE_LENGTH = 4;

export class AnomalyEngine {
  readonly detectorRegistry: DetectorRegistry;
  private toolCalls = new Map<string, ToolCallTracker>();
  private costTrackers = new Map<string, CostTracker>();
  private contextTrackers = new Map<string, ContextTracker>();
  private handoffTrackers = new Map<string, HandoffTracker>();

  constructor() {
    this.detectorRegistry = new DetectorRegistry();
    this.registerBuiltInDetectors();
  }

  private registerBuiltInDetectors(): void {
    const self = this;
    this.detectorRegistry.register({
      name: 'infinite_loop',
      evaluate: (event) => { const r = self.detectLoop(event); return r ? [r] : []; },
      clear: () => self.toolCalls.clear(),
    });
    this.detectorRegistry.register({
      name: 'cost_spike',
      evaluate: (event) => { const r = self.detectCostSpike(event); return r ? [r] : []; },
      clear: () => self.costTrackers.clear(),
    });
    this.detectorRegistry.register({
      name: 'context_bloat',
      evaluate: (event) => { const r = self.detectContextBloat(event); return r ? [r] : []; },
      clear: () => self.contextTrackers.clear(),
    });
    this.detectorRegistry.register({
      name: 'handoff_cycle',
      evaluate: (event) => { const r = self.detectHandoffCycle(event); return r ? [r] : []; },
      clear: () => self.handoffTrackers.clear(),
    });
  }

  /**
   * Process an event and return any anomaly alerts detected.
   * Runs all registered detectors (built-in + plugins).
   */
  evaluate(event: AgentEvent): AnomalyAlert[] {
    return this.detectorRegistry.evaluateAll(event);
  }

  /**
   * Infinite loop detection: 3+ identical consecutive tool calls by the same agent.
   * Triggered on `turn.acting` events with a tool_name in data.
   */
  detectLoop(event: AgentEvent): AnomalyAlert | null {
    if (event.event_type !== 'turn.acting') return null;

    const toolName = this.extractString(event.data, 'tool_name');
    if (!toolName) return null;

    const key = event.agent_id;
    let tracker = this.toolCalls.get(key);
    if (!tracker) {
      tracker = { recentTools: [] };
      this.toolCalls.set(key, tracker);
    }

    tracker.recentTools.push(toolName);

    // Keep only the last LOOP_THRESHOLD entries
    if (tracker.recentTools.length > LOOP_THRESHOLD) {
      tracker.recentTools = tracker.recentTools.slice(-LOOP_THRESHOLD);
    }

    if (tracker.recentTools.length >= LOOP_THRESHOLD) {
      const allSame = tracker.recentTools.every((t) => t === toolName);
      if (allSame) {
        // Reset after detection so we don't fire repeatedly
        tracker.recentTools = [];
        return {
          type: 'infinite_loop',
          agent_id: event.agent_id,
          swarm_id: event.swarm_id,
          message: `Agent "${event.agent_id}" called tool "${toolName}" ${LOOP_THRESHOLD}+ times consecutively`,
          severity: 'warn',
          detected_at: new Date().toISOString(),
          details: {
            tool_name: toolName,
            consecutive_count: LOOP_THRESHOLD,
          },
        };
      }
    }

    return null;
  }

  /**
   * Cost spike detection: agent cost > 3x running average.
   * Triggered on `cost.api_call` or `cost.tokens` events with cost_usd in data.
   */
  detectCostSpike(event: AgentEvent): AnomalyAlert | null {
    if (event.event_type !== 'cost.api_call' && event.event_type !== 'cost.tokens') return null;

    const costUsd = this.extractNumber(event.data, 'cost_usd');
    if (costUsd == null || costUsd <= 0) return null;

    const key = event.agent_id;
    let tracker = this.costTrackers.get(key);
    if (!tracker) {
      tracker = { costs: [], total: 0 };
      this.costTrackers.set(key, tracker);
    }

    // Compute running average before adding the new cost
    const count = tracker.costs.length;
    if (count >= 2) {
      const average = tracker.total / count;
      if (costUsd > average * COST_SPIKE_MULTIPLIER) {
        // Record but still alert
        tracker.costs.push(costUsd);
        tracker.total += costUsd;
        return {
          type: 'cost_spike',
          agent_id: event.agent_id,
          swarm_id: event.swarm_id,
          message: `Agent "${event.agent_id}" cost $${costUsd.toFixed(4)} exceeds ${COST_SPIKE_MULTIPLIER}x running average ($${average.toFixed(4)})`,
          severity: 'warn',
          detected_at: new Date().toISOString(),
          details: {
            cost_usd: costUsd,
            running_average: average,
            multiplier: costUsd / average,
          },
        };
      }
    }

    tracker.costs.push(costUsd);
    tracker.total += costUsd;
    return null;
  }

  /**
   * Context bloat detection: context growth > 10% per turn.
   * Triggered on `turn.started` events with context_tokens in data.
   */
  detectContextBloat(event: AgentEvent): AnomalyAlert | null {
    if (event.event_type !== 'turn.started') return null;

    const contextTokens = this.extractNumber(event.data, 'context_tokens');
    if (contextTokens == null || contextTokens <= 0) return null;

    const key = event.agent_id;
    let tracker = this.contextTrackers.get(key);
    if (!tracker) {
      tracker = { sizes: [] };
      this.contextTrackers.set(key, tracker);
    }

    const prev = tracker.sizes.length > 0 ? tracker.sizes[tracker.sizes.length - 1] : null;
    tracker.sizes.push(contextTokens);

    if (prev != null && prev > 0) {
      const growth = (contextTokens - prev) / prev;
      if (growth > CONTEXT_BLOAT_RATE) {
        return {
          type: 'context_bloat',
          agent_id: event.agent_id,
          swarm_id: event.swarm_id,
          message: `Agent "${event.agent_id}" context grew ${(growth * 100).toFixed(1)}% (${prev} -> ${contextTokens} tokens)`,
          severity: 'warn',
          detected_at: new Date().toISOString(),
          details: {
            previous_tokens: prev,
            current_tokens: contextTokens,
            growth_rate: growth,
          },
        };
      }
    }

    return null;
  }

  /**
   * Handoff cycle detection: A->B->A->B pattern.
   * Triggered on `handoff.initiated` events.
   */
  detectHandoffCycle(event: AgentEvent): AnomalyAlert | null {
    if (event.event_type !== 'handoff.initiated') return null;

    const targetAgentId = this.extractString(event.data, 'target_agent_id');
    if (!targetAgentId) return null;

    const key = event.swarm_id;
    let tracker = this.handoffTrackers.get(key);
    if (!tracker) {
      tracker = { sequence: [] };
      this.handoffTrackers.set(key, tracker);
    }

    tracker.sequence.push({ from: event.agent_id, to: targetAgentId });

    // Keep only the last HANDOFF_CYCLE_LENGTH entries
    if (tracker.sequence.length > HANDOFF_CYCLE_LENGTH) {
      tracker.sequence = tracker.sequence.slice(-HANDOFF_CYCLE_LENGTH);
    }

    // Check for A->B->A->B pattern
    if (tracker.sequence.length >= HANDOFF_CYCLE_LENGTH) {
      const seq = tracker.sequence;
      const len = seq.length;
      const h0 = seq[len - 4];
      const h1 = seq[len - 3];
      const h2 = seq[len - 2];
      const h3 = seq[len - 1];

      if (
        h0.from === h2.from &&
        h0.to === h2.to &&
        h1.from === h3.from &&
        h1.to === h3.to &&
        h0.from === h1.to &&
        h0.to === h1.from
      ) {
        // Reset after detection
        tracker.sequence = [];
        return {
          type: 'handoff_cycle',
          agent_id: event.agent_id,
          swarm_id: event.swarm_id,
          message: `Handoff cycle detected: ${h0.from} <-> ${h0.to} repeated`,
          severity: 'warn',
          detected_at: new Date().toISOString(),
          details: {
            agents: [h0.from, h0.to],
            cycle_length: HANDOFF_CYCLE_LENGTH,
          },
        };
      }
    }

    return null;
  }

  /** Reset all tracking state (built-in + plugin detectors). */
  clear(): void {
    this.detectorRegistry.clearAll();
  }

  private extractString(data: Record<string, unknown>, key: string): string | null {
    const val = data[key];
    return typeof val === 'string' ? val : null;
  }

  private extractNumber(data: Record<string, unknown>, key: string): number | null {
    const val = data[key];
    return typeof val === 'number' ? val : null;
  }
}
