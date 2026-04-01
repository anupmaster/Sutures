"use client";

import { create } from "zustand";

export interface AnomalyAlert {
  type: "infinite_loop" | "cost_spike" | "context_bloat" | "handoff_cycle";
  agentId: string;
  swarmId: string;
  message: string;
  severity: string;
  detectedAt: string;
  details: Record<string, unknown>;
  dismissed: boolean;
}

interface AnomalyState {
  alerts: AnomalyAlert[];
  pushAlert: (alert: AnomalyAlert) => void;
  dismissAlert: (index: number) => void;
  dismissAll: () => void;
  undismissedCount: () => number;
}

export const useAnomalyStore = create<AnomalyState>((set, get) => ({
  alerts: [],

  pushAlert: (alert) =>
    set((state) => ({
      alerts: [...state.alerts.slice(-99), alert],
    })),

  dismissAlert: (index) =>
    set((state) => ({
      alerts: state.alerts.map((a, i) =>
        i === index ? { ...a, dismissed: true } : a
      ),
    })),

  dismissAll: () =>
    set((state) => ({
      alerts: state.alerts.map((a) => ({ ...a, dismissed: true })),
    })),

  undismissedCount: () => get().alerts.filter((a) => !a.dismissed).length,
}));
