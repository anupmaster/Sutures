"use client";

import { create } from "zustand";
import type {
  AgentInfo,
  AgentState,
  HandoffEdgeData,
  SwarmSummary,
} from "@/lib/types";

interface SwarmState {
  // Current swarm
  currentSwarmId: string | null;
  swarms: SwarmSummary[];

  // Agents
  agents: Map<string, AgentInfo>;
  edges: HandoffEdgeData[];
  selectedAgentId: string | null;

  // Run state
  runStartedAt: string | null;
  totalCost: number;

  // Actions
  setCurrentSwarm: (id: string) => void;
  setSwarms: (swarms: SwarmSummary[]) => void;
  setSelectedAgent: (id: string | null) => void;
  upsertAgent: (agent: AgentInfo) => void;
  updateAgentState: (agentId: string, state: AgentState) => void;
  updateAgentCost: (agentId: string, cost: number) => void;
  incrementTurnCount: (agentId: string) => void;
  addContextMessage: (
    agentId: string,
    message: AgentInfo["contextMessages"][0]
  ) => void;
  addToolCall: (agentId: string, toolCall: AgentInfo["toolCalls"][0]) => void;
  setEdges: (edges: HandoffEdgeData[]) => void;
  addEdge: (edge: HandoffEdgeData) => void;
  setTopology: (agents: AgentInfo[], edges: HandoffEdgeData[]) => void;
  setRunStartedAt: (ts: string) => void;
  reset: () => void;
}

export const useSwarmStore = create<SwarmState>((set, get) => ({
  currentSwarmId: null,
  swarms: [],
  agents: new Map(),
  edges: [],
  selectedAgentId: null,
  runStartedAt: null,
  totalCost: 0,

  setCurrentSwarm: (id) => set({ currentSwarmId: id }),

  setSwarms: (swarms) => set({ swarms }),

  setSelectedAgent: (id) => set({ selectedAgentId: id }),

  upsertAgent: (agent) =>
    set((state) => {
      const next = new Map(state.agents);
      next.set(agent.id, agent);
      const totalCost = Array.from(next.values()).reduce(
        (sum, a) => sum + a.cumulativeCost,
        0
      );
      return { agents: next, totalCost };
    }),

  updateAgentState: (agentId, agentState) =>
    set((state) => {
      const existing = state.agents.get(agentId);
      if (!existing) return state;
      const next = new Map(state.agents);
      next.set(agentId, { ...existing, state: agentState });
      return { agents: next };
    }),

  updateAgentCost: (agentId, cost) =>
    set((state) => {
      const existing = state.agents.get(agentId);
      if (!existing) return state;
      const next = new Map(state.agents);
      next.set(agentId, { ...existing, cumulativeCost: cost });
      const totalCost = Array.from(next.values()).reduce(
        (sum, a) => sum + a.cumulativeCost,
        0
      );
      return { agents: next, totalCost };
    }),

  incrementTurnCount: (agentId) =>
    set((state) => {
      const existing = state.agents.get(agentId);
      if (!existing) return state;
      const next = new Map(state.agents);
      next.set(agentId, { ...existing, turnCount: existing.turnCount + 1 });
      return { agents: next };
    }),

  addContextMessage: (agentId, message) =>
    set((state) => {
      const existing = state.agents.get(agentId);
      if (!existing) return state;
      const next = new Map(state.agents);
      next.set(agentId, {
        ...existing,
        contextMessages: [...existing.contextMessages, message],
      });
      return { agents: next };
    }),

  addToolCall: (agentId, toolCall) =>
    set((state) => {
      const existing = state.agents.get(agentId);
      if (!existing) return state;
      const next = new Map(state.agents);
      next.set(agentId, {
        ...existing,
        toolCalls: [...existing.toolCalls, toolCall],
      });
      return { agents: next };
    }),

  setEdges: (edges) => set({ edges }),

  addEdge: (edge) =>
    set((state) => ({ edges: [...state.edges, edge] })),

  setTopology: (agents, edges) =>
    set(() => {
      const agentMap = new Map<string, AgentInfo>();
      for (const a of agents) agentMap.set(a.id, a);
      const totalCost = agents.reduce((sum, a) => sum + a.cumulativeCost, 0);
      return { agents: agentMap, edges, totalCost };
    }),

  setRunStartedAt: (ts) => set({ runStartedAt: ts }),

  reset: () =>
    set({
      agents: new Map(),
      edges: [],
      selectedAgentId: null,
      totalCost: 0,
      runStartedAt: null,
    }),
}));
