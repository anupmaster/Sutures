"use client";

import { create } from "zustand";
import type { AgentEvent, EventCategory } from "@/lib/types";
import { MAX_EVENTS } from "@/lib/constants";

interface EventState {
  events: AgentEvent[];
  pushEvent: (event: AgentEvent) => void;
  pushEvents: (events: AgentEvent[]) => void;
  getFilteredEvents: (filters: {
    agentId?: string;
    category?: EventCategory;
    type?: string;
  }) => AgentEvent[];
  clear: () => void;
}

export const useEventStore = create<EventState>((set, get) => ({
  events: [],

  pushEvent: (event) =>
    set((state) => {
      const next = [...state.events, event];
      if (next.length > MAX_EVENTS) {
        return { events: next.slice(next.length - MAX_EVENTS) };
      }
      return { events: next };
    }),

  pushEvents: (events) =>
    set((state) => {
      const next = [...state.events, ...events];
      if (next.length > MAX_EVENTS) {
        return { events: next.slice(next.length - MAX_EVENTS) };
      }
      return { events: next };
    }),

  getFilteredEvents: (filters) => {
    const { events } = get();
    return events.filter((e) => {
      if (filters.agentId && e.agentId !== filters.agentId) return false;
      if (filters.category && e.category !== filters.category) return false;
      if (filters.type && e.type !== filters.type) return false;
      return true;
    });
  },

  clear: () => set({ events: [] }),
}));
