"use client";

import { create } from "zustand";
import type { Breakpoint, BreakpointHit } from "@/lib/types";

interface BreakpointState {
  breakpoints: Breakpoint[];
  hits: BreakpointHit[];

  addBreakpoint: (bp: Breakpoint) => void;
  removeBreakpoint: (id: string) => void;
  toggleBreakpoint: (id: string) => void;
  recordHit: (hit: BreakpointHit) => void;
  clearHits: () => void;
}

export const useBreakpointStore = create<BreakpointState>((set) => ({
  breakpoints: [],
  hits: [],

  addBreakpoint: (bp) =>
    set((state) => ({
      breakpoints: [...state.breakpoints, bp],
    })),

  removeBreakpoint: (id) =>
    set((state) => ({
      breakpoints: state.breakpoints.filter((bp) => bp.id !== id),
    })),

  toggleBreakpoint: (id) =>
    set((state) => ({
      breakpoints: state.breakpoints.map((bp) =>
        bp.id === id ? { ...bp, enabled: !bp.enabled } : bp
      ),
    })),

  recordHit: (hit) =>
    set((state) => ({
      hits: [...state.hits, hit],
      breakpoints: state.breakpoints.map((bp) =>
        bp.id === hit.breakpointId
          ? { ...bp, hitCount: bp.hitCount + 1 }
          : bp
      ),
    })),

  clearHits: () => set({ hits: [] }),
}));
