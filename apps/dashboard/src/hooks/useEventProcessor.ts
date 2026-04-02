"use client";

import { useCallback } from "react";
import { useSwarmStore } from "@/stores/swarmStore";
import { useEventStore } from "@/stores/eventStore";
import { useBreakpointStore } from "@/stores/breakpointStore";
import { useMemoryStore } from "@/stores/memoryStore";
import type { AgentEvent, AgentInfo, AgentState, EventCategory, HandoffEdgeData, MemoryTier } from "@/lib/types";

/**
 * Maps raw wire-format events from the collector (snake_case, protocol event types)
 * into the dashboard's internal format, then routes to appropriate stores.
 */

function mapTopologyStatus(status: string): AgentState {
  switch (status) {
    case "spawned":
      return "spawned";
    case "idle":
      return "idle";
    case "thinking":
      return "thinking";
    case "acting":
      return "acting";
    case "observing":
      return "observing";
    case "paused":
      return "paused";
    case "completed":
      return "completed";
    case "failed":
      return "failed";
    default:
      return "idle";
  }
}

function eventCategory(eventType: string): EventCategory {
  if (eventType.startsWith("agent.")) return "lifecycle";
  if (eventType.startsWith("turn.")) return "reasoning";
  if (eventType.startsWith("handoff.")) return "collaboration";
  if (eventType.startsWith("memory.") || eventType.startsWith("checkpoint."))
    return "memory";
  if (eventType.startsWith("breakpoint.")) return "intervention";
  if (eventType.startsWith("cost.")) return "cost";
  return "lifecycle";
}

/**
 * Transform a raw wire event (snake_case from collector) into dashboard AgentEvent.
 */
function transformWireEvent(raw: Record<string, unknown>): AgentEvent {
  const data = (raw.data ?? raw.payload ?? {}) as Record<string, unknown>;
  const eventType = (raw.event_type ?? raw.type ?? "unknown") as string;

  return {
    id: (raw.event_id ?? raw.id ?? crypto.randomUUID()) as string,
    type: eventType,
    category: eventCategory(eventType),
    agentId: (raw.agent_id ?? raw.agentId ?? "unknown") as string,
    agentName:
      (data.name as string) ??
      (raw.agent_id as string) ??
      (raw.agentId as string) ??
      "unknown",
    swarmId: (raw.swarm_id ?? raw.swarmId ?? "") as string,
    timestamp: (raw.timestamp ?? new Date().toISOString()) as string,
    payload: data,
  };
}

// Module-level caches — persist across renders
const agentNames = new Map<string, string>();
const knownSwarms = new Map<string, { name: string; agentCount: number; totalCost: number; startedAt: string }>();

export function useEventProcessor() {
  const upsertAgent = useSwarmStore((s) => s.upsertAgent);
  const updateAgentState = useSwarmStore((s) => s.updateAgentState);
  const updateAgentCost = useSwarmStore((s) => s.updateAgentCost);
  const incrementTurnCount = useSwarmStore((s) => s.incrementTurnCount);
  const addToolCall = useSwarmStore((s) => s.addToolCall);
  const addContextMessage = useSwarmStore((s) => s.addContextMessage);
  const addEdge = useSwarmStore((s) => s.addEdge);
  const setRunStartedAt = useSwarmStore((s) => s.setRunStartedAt);
  const setSwarms = useSwarmStore((s) => s.setSwarms);
  const setCurrentSwarm = useSwarmStore((s) => s.setCurrentSwarm);
  const pushEvents = useEventStore((s) => s.pushEvents);
  const recordHit = useBreakpointStore((s) => s.recordHit);
  const addMemoryEntry = useMemoryStore((s) => s.addEntry);
  const migrateMemoryEntry = useMemoryStore((s) => s.migrateEntry);
  const updatePressure = useMemoryStore((s) => s.updatePressure);
  const addSharedKey = useMemoryStore((s) => s.addSharedKey);
  const markStale = useMemoryStore((s) => s.markStale);
  const addConflict = useMemoryStore((s) => s.addConflict);
  const removeMemoryEntry = useMemoryStore((s) => s.removeEntry);

  const processEvents = useCallback(
    (rawEvents: AgentEvent[]) => {
      // rawEvents may be already-transformed or raw wire format
      // We handle both by checking for event_type (wire) vs type (dashboard)
      const events: AgentEvent[] = rawEvents.map((raw) => {
        const wireRaw = raw as unknown as Record<string, unknown>;
        // If it has event_type, it's wire format — transform it
        if (wireRaw.event_type) {
          return transformWireEvent(wireRaw);
        }
        // Already dashboard format (unlikely but handle it)
        return raw;
      });

      // Enrich agent names from cache
      for (const event of events) {
        if (event.agentName === event.agentId && agentNames.has(event.agentId)) {
          event.agentName = agentNames.get(event.agentId)!;
        }
      }

      pushEvents(events);

      for (const event of events) {
        const { type, agentId, payload } = event;

        switch (type) {
          // ── Lifecycle ──
          case "agent.spawned": {
            const name = (payload.name as string) ?? agentId;
            agentNames.set(agentId, name);
            event.agentName = name; // fix the event too

            const agent: AgentInfo = {
              id: agentId,
              name,
              model: (payload.model as string) ?? "unknown",
              state: "idle",
              turnCount: 0,
              cumulativeCost: 0,
              contextMessages: [],
              toolCalls: [],
            };
            upsertAgent(agent);
            setRunStartedAt(event.timestamp);

            // Track swarm for dropdown
            if (event.swarmId) {
              const existing = knownSwarms.get(event.swarmId);
              if (existing) {
                existing.agentCount += 1;
              } else {
                const swarmName = (payload.swarm_name as string) ?? `Swarm ${event.swarmId.slice(0, 8)}`;
                knownSwarms.set(event.swarmId, {
                  name: swarmName,
                  agentCount: 1,
                  totalCost: 0,
                  startedAt: event.timestamp,
                });
              }
              // Update the store with all known swarms
              const swarmSummaries = Array.from(knownSwarms.entries()).map(
                ([id, s]) => ({ id, ...s })
              );
              setSwarms(swarmSummaries);
              // Auto-select first swarm if none selected
              if (!useSwarmStore.getState().currentSwarmId) {
                setCurrentSwarm(event.swarmId);
              }
            }
            break;
          }

          case "agent.idle":
            updateAgentState(agentId, "idle");
            break;

          case "agent.completed":
            updateAgentState(agentId, "completed");
            if (typeof payload.total_cost_usd === "number") {
              updateAgentCost(agentId, payload.total_cost_usd as number);
            }
            break;

          case "agent.failed":
            updateAgentState(agentId, "failed");
            break;

          case "agent.paused":
            updateAgentState(agentId, "paused");
            break;

          case "agent.resumed":
            updateAgentState(agentId, "idle");
            break;

          // ── Reasoning ──
          case "turn.started":
            updateAgentState(agentId, "thinking");
            incrementTurnCount(agentId);
            // Update context pressure if token info present
            if (payload.input_tokens || payload.context_tokens) {
              const usedTokens = (payload.context_tokens as number) ?? (payload.input_tokens as number) ?? 0;
              const maxTokens = (payload.max_tokens as number) ?? 200000;
              updatePressure(agentId, {
                agentId,
                usedTokens,
                maxTokens,
                percentage: Math.min(100, (usedTokens / maxTokens) * 100),
              });
            }
            // Add user input to context if present
            if (payload.input || payload.prompt || payload.user_message) {
              addContextMessage(agentId, {
                role: "user",
                content: (payload.input as string) ?? (payload.prompt as string) ?? (payload.user_message as string) ?? "",
                tokenCount: (payload.context_tokens as number) ?? undefined,
                timestamp: event.timestamp,
              });
            }
            break;

          case "turn.thinking": {
            updateAgentState(agentId, "thinking");
            const thinkContent = (payload.content as string) ?? (payload.text as string) ?? null;
            if (thinkContent) {
              addContextMessage(agentId, {
                role: "assistant",
                content: thinkContent,
                tokenCount: (payload.token_count as number) ?? (payload.prompt_tokens as number) ?? undefined,
                timestamp: event.timestamp,
              });
            }
            break;
          }

          case "turn.thought":
            updateAgentState(agentId, "thinking");
            if (payload.content || payload.thought) {
              addContextMessage(agentId, {
                role: "assistant",
                content: (payload.thought as string) ?? (payload.content as string) ?? "",
                tokenCount: (payload.token_count as number) ?? undefined,
                timestamp: event.timestamp,
              });
            }
            break;

          case "turn.acting":
            updateAgentState(agentId, "acting");
            if (payload.tool_name) {
              addContextMessage(agentId, {
                role: "assistant",
                content: `Calling tool: ${payload.tool_name as string}`,
                timestamp: event.timestamp,
              });
            }
            break;

          case "turn.observed":
            updateAgentState(agentId, "idle");
            if (payload.tool_name) {
              addToolCall(agentId, {
                turn: (payload.turn_number as number) ?? 0,
                toolName: payload.tool_name as string,
                inputSummary:
                  (payload.tool_input_summary as string) ?? "",
                outputSummary:
                  (payload.tool_output_summary as string) ?? "",
                latencyMs: 0,
                success: true,
                timestamp: event.timestamp,
              });
              // Also add tool result to context
              addContextMessage(agentId, {
                role: "tool",
                content: (payload.tool_output_summary as string) ?? `${payload.tool_name} completed`,
                timestamp: event.timestamp,
              });
            }
            break;

          case "turn.completed":
            updateAgentState(agentId, "idle");
            break;

          case "turn.failed":
            updateAgentState(agentId, "paused");
            break;

          // ── Collaboration ──
          case "handoff.initiated":
            if (payload.target_agent_id) {
              addEdge({
                id: event.id,
                sourceAgentId:
                  (payload.source_agent_id as string) ?? agentId,
                targetAgentId: payload.target_agent_id as string,
                type: "delegation",
                active: true,
                label: (payload.reason as string) ?? undefined,
                timestamp: event.timestamp,
              });
            }
            break;

          case "handoff.accepted":
            // Edge already added on initiate — could mark as active
            break;

          case "handoff.completed":
            // Could mark edge as inactive
            break;

          case "handoff.rejected":
            break;

          // ── Cost ──
          case "cost.tokens":
            if (typeof payload.cumulative_cost_usd === "number") {
              updateAgentCost(
                agentId,
                payload.cumulative_cost_usd as number
              );
            } else if (typeof payload.cost_usd === "number") {
              // Fallback: accumulate by reading current cost and adding
              const currentAgent = useSwarmStore.getState().agents.get(agentId);
              const currentCost = currentAgent?.cumulativeCost ?? 0;
              updateAgentCost(agentId, currentCost + (payload.cost_usd as number));
            }
            break;

          case "cost.api_call":
            if (typeof payload.cost_usd === "number") {
              updateAgentCost(agentId, payload.cost_usd as number);
            }
            break;

          // ── Intervention ──
          case "breakpoint.hit":
            updateAgentState(agentId, "paused");
            recordHit({
              breakpointId: (payload.breakpoint_id as string) ?? event.id,
              agentId,
              agentName: event.agentName,
              timestamp: event.timestamp,
              eventId: event.id,
            });
            break;

          case "breakpoint.set":
          case "breakpoint.inject":
          case "breakpoint.release":
            // Informational — no state change needed
            break;

          // ── Memory ──
          case "memory.write": {
            const tier = (payload.tier as MemoryTier) ?? "stm";
            const key = (payload.key as string) ?? "unknown";
            addMemoryEntry(agentId, {
              key,
              value: (payload.value as string) ?? "",
              tier,
              heat: 1.0, // freshly written = hot
              lastAccessed: event.timestamp,
              createdAt: event.timestamp,
              agentId,
              shared: (payload.shared as boolean) ?? false,
            });
            // Track shared memory keys
            if (payload.shared) {
              addSharedKey({
                key,
                ownerAgentId: agentId,
                readerAgentIds: (payload.reader_agent_ids as string[]) ?? [],
                lastUpdated: event.timestamp,
                stale: false,
              });
            }
            break;
          }

          case "memory.read": {
            // Update heat on read (accessed = hotter)
            // Uses getState() directly so updateHeat doesn't need to be in the dep array
            const readKey = (payload.key as string) ?? "";
            if (readKey) {
              const { entries, updateHeat } = useMemoryStore.getState();
              const agentEntries = entries.get(agentId) ?? [];
              const entry = agentEntries.find((e) => e.key === readKey);
              if (entry) {
                updateHeat(agentId, readKey, Math.min(1.0, entry.heat + 0.2));
              }
            }
            break;
          }

          case "checkpoint.created":
            // Checkpoints stored server-side — just log
            break;

          case "memory.tier_migration": {
            const migKey = (payload.key as string) ?? "";
            const toTier = (payload.to_tier as MemoryTier) ?? "mtm";
            const reason = (payload.reason as string) ?? "automatic";
            if (migKey) {
              migrateMemoryEntry(agentId, migKey, toTier, reason);
            }
            break;
          }

          case "memory.conflict": {
            addConflict({
              key: (payload.key as string) ?? "unknown",
              agentIds: (payload.agent_ids as string[]) ?? [agentId],
              values: (payload.values as string[]) ?? [],
              timestamp: event.timestamp,
            });
            break;
          }

          case "memory.prune": {
            const pruneKey = (payload.key as string) ?? "";
            if (pruneKey) {
              removeMemoryEntry(agentId, pruneKey);
            }
            break;
          }

          case "memory.reconsolidate":
            // Re-consolidation: update entry value in place
            if (payload.key) {
              addMemoryEntry(agentId, {
                key: payload.key as string,
                value: (payload.new_value as string) ?? "",
                tier: (payload.tier as MemoryTier) ?? "mtm",
                heat: 0.8,
                lastAccessed: event.timestamp,
                createdAt: event.timestamp,
                agentId,
                shared: (payload.shared as boolean) ?? false,
              });
            }
            break;

          case "memory.structure_switch":
            // Informational — log the switch
            break;

          case "memory.coherence_violation": {
            const violationKey = (payload.key as string) ?? "";
            if (violationKey) {
              markStale(violationKey);
            }
            break;
          }

          default:
            // Unknown event type — still logged in event store
            break;
        }
      }
    },
    [
      pushEvents,
      upsertAgent,
      updateAgentState,
      updateAgentCost,
      incrementTurnCount,
      addToolCall,
      addContextMessage,
      addEdge,
      setRunStartedAt,
      setSwarms,
      setCurrentSwarm,
      recordHit,
      addMemoryEntry,
      migrateMemoryEntry,
      updatePressure,
      addSharedKey,
      markStale,
      addConflict,
      removeMemoryEntry,
    ]
  );

  const processTopology = useCallback(
    (topology: Record<string, unknown>) => {
      const { setTopology } = useSwarmStore.getState();

      // Collector sends agents as Record<string, TopologyAgent> — convert to AgentInfo[]
      const rawAgents = topology.agents;
      let agents: AgentInfo[] = [];
      if (rawAgents && typeof rawAgents === "object" && !Array.isArray(rawAgents)) {
        // Object keyed by agent_id (server-side format)
        agents = Object.values(rawAgents as Record<string, Record<string, unknown>>).map((a) => ({
          id: (a.agent_id as string) ?? "",
          name: (a.name as string) ?? (a.agent_id as string) ?? "unknown",
          model: (a.model as string) ?? "unknown",
          state: mapTopologyStatus((a.status as string) ?? "idle"),
          turnCount: 0,
          cumulativeCost: 0,
          contextMessages: [],
          toolCalls: [],
        }));
      } else if (Array.isArray(rawAgents)) {
        agents = rawAgents as AgentInfo[];
      }

      // Collector sends edges as TopologyEdge[] — convert to HandoffEdgeData[]
      const rawEdges = (topology.edges ?? []) as Record<string, unknown>[];
      const edges: HandoffEdgeData[] = rawEdges.map((e) => ({
        id: (e.edge_id as string) ?? (e.id as string) ?? crypto.randomUUID(),
        sourceAgentId: (e.source_agent_id as string) ?? (e.sourceAgentId as string) ?? "",
        targetAgentId: (e.target_agent_id as string) ?? (e.targetAgentId as string) ?? "",
        type: "delegation" as const,
        active: false,
        label: (e.label as string) ?? undefined,
        timestamp: (e.timestamp as string) ?? new Date().toISOString(),
      }));

      setTopology(agents, edges);

      // Also update swarm tracking from topology
      const swarmId = topology.swarm_id as string;
      if (swarmId) {
        const { swarms, setSwarms: setSwarmsFn, currentSwarmId, setCurrentSwarm: setCurrentFn } = useSwarmStore.getState();
        if (!swarms.find((s) => s.id === swarmId)) {
          setSwarmsFn([...swarms, {
            id: swarmId,
            name: `Swarm ${swarmId.slice(0, 8)}`,
            agentCount: agents.length,
            totalCost: 0,
            startedAt: new Date().toISOString(),
          }]);
        }
        if (!currentSwarmId) {
          setCurrentFn(swarmId);
        }
      }
    },
    []
  );

  return { processEvents, processTopology };
}
