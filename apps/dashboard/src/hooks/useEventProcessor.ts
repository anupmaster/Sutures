"use client";

import { useCallback } from "react";
import { useSwarmStore } from "@/stores/swarmStore";
import { useEventStore } from "@/stores/eventStore";
import { useBreakpointStore } from "@/stores/breakpointStore";
import type { AgentEvent, AgentInfo, SwarmTopology } from "@/lib/types";

export function useEventProcessor() {
  const upsertAgent = useSwarmStore((s) => s.upsertAgent);
  const updateAgentState = useSwarmStore((s) => s.updateAgentState);
  const updateAgentCost = useSwarmStore((s) => s.updateAgentCost);
  const incrementTurnCount = useSwarmStore((s) => s.incrementTurnCount);
  const addContextMessage = useSwarmStore((s) => s.addContextMessage);
  const addToolCall = useSwarmStore((s) => s.addToolCall);
  const addEdge = useSwarmStore((s) => s.addEdge);
  const setTopology = useSwarmStore((s) => s.setTopology);
  const setRunStartedAt = useSwarmStore((s) => s.setRunStartedAt);
  const pushEvents = useEventStore((s) => s.pushEvents);
  const breakpoints = useBreakpointStore((s) => s.breakpoints);
  const recordHit = useBreakpointStore((s) => s.recordHit);

  const processEvents = useCallback(
    (events: AgentEvent[]) => {
      pushEvents(events);

      for (const event of events) {
        const { type, agentId, agentName, payload, timestamp } = event;

        switch (type) {
          case "agent.spawn":
          case "agent.start": {
            const agent: AgentInfo = {
              id: agentId,
              name: agentName,
              model: (payload.model as string) ?? "unknown",
              state: "idle",
              turnCount: 0,
              cumulativeCost: 0,
              contextMessages: [],
              toolCalls: [],
            };
            upsertAgent(agent);
            if (type === "agent.start") {
              setRunStartedAt(timestamp);
            }
            break;
          }

          case "agent.state_change":
            if (payload.state) {
              updateAgentState(
                agentId,
                payload.state as AgentInfo["state"]
              );
            }
            break;

          case "turn.start":
            updateAgentState(agentId, "thinking");
            incrementTurnCount(agentId);
            break;

          case "turn.end":
            updateAgentState(agentId, "idle");
            break;

          case "tool.call":
            updateAgentState(agentId, "acting");
            break;

          case "tool.result":
            updateAgentState(agentId, "idle");
            if (payload.toolName) {
              addToolCall(agentId, {
                turn: (payload.turn as number) ?? 0,
                toolName: payload.toolName as string,
                inputSummary: (payload.inputSummary as string) ?? "",
                outputSummary: (payload.outputSummary as string) ?? "",
                latencyMs: (payload.latencyMs as number) ?? 0,
                success: (payload.success as boolean) ?? true,
                timestamp,
              });
            }
            break;

          case "reasoning.message":
            if (payload.role && payload.content) {
              addContextMessage(agentId, {
                role: payload.role as "user" | "assistant" | "system" | "tool",
                content: payload.content as string,
                tokenCount: payload.tokenCount as number | undefined,
                timestamp,
              });
            }
            break;

          case "handoff.initiate":
          case "handoff.complete":
            if (payload.targetAgentId) {
              addEdge({
                id: event.id,
                sourceAgentId: agentId,
                targetAgentId: payload.targetAgentId as string,
                type:
                  (payload.handoffType as
                    | "delegation"
                    | "escalation"
                    | "broadcast"
                    | "return") ?? "delegation",
                active: type === "handoff.initiate",
                label: payload.label as string | undefined,
                timestamp,
              });
            }
            break;

          case "cost.update":
            if (typeof payload.cumulativeCost === "number") {
              updateAgentCost(agentId, payload.cumulativeCost);
            }
            break;

          case "breakpoint.hit":
            updateAgentState(agentId, "paused");
            break;

          case "agent.complete":
          case "agent.end":
            updateAgentState(agentId, "completed");
            break;

          case "agent.error":
            updateAgentState(agentId, "paused");
            break;
        }

        // Check breakpoints
        for (const bp of breakpoints) {
          if (!bp.enabled) continue;
          if (bp.agentId && bp.agentId !== agentId) continue;

          let hit = false;
          switch (bp.condition) {
            case "always":
              hit = true;
              break;
            case "on_turn":
              hit = type === "turn.start";
              break;
            case "on_tool":
              hit = type === "tool.call";
              break;
            case "on_error":
              hit = type === "agent.error";
              break;
            case "on_handoff":
              hit =
                type === "handoff.initiate" || type === "handoff.complete";
              break;
            case "on_cost":
              if (
                type === "cost.update" &&
                typeof payload.cumulativeCost === "number" &&
                typeof bp.params?.threshold === "number"
              ) {
                hit = payload.cumulativeCost >= bp.params.threshold;
              }
              break;
          }

          if (hit) {
            recordHit({
              breakpointId: bp.id,
              agentId,
              agentName,
              timestamp,
              eventId: event.id,
            });
          }
        }
      }
    },
    [
      pushEvents,
      upsertAgent,
      updateAgentState,
      updateAgentCost,
      incrementTurnCount,
      addContextMessage,
      addToolCall,
      addEdge,
      setRunStartedAt,
      breakpoints,
      recordHit,
    ]
  );

  const processTopology = useCallback(
    (topology: SwarmTopology) => {
      setTopology(topology.agents, topology.edges);
    },
    [setTopology]
  );

  return { processEvents, processTopology };
}
