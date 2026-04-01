"use client";

import { create } from "zustand";
import type {
  MemoryEntry,
  MemoryTier,
  MemoryTierSummary,
  ContextPressure,
  SharedMemoryKey,
  MemoryMigrationEvent,
  MemoryConflict,
} from "@/lib/types";

interface MemoryState {
  // Per-agent memory entries
  entries: Map<string, MemoryEntry[]>; // agentId → entries
  // Context pressure per agent
  pressure: Map<string, ContextPressure>;
  // Shared memory keys
  sharedKeys: SharedMemoryKey[];
  // Migration history
  migrations: MemoryMigrationEvent[];
  // Active conflicts
  conflicts: MemoryConflict[];

  // Actions
  setEntries: (agentId: string, entries: MemoryEntry[]) => void;
  addEntry: (agentId: string, entry: MemoryEntry) => void;
  migrateEntry: (agentId: string, key: string, toTier: MemoryTier, reason: string) => void;
  updatePressure: (agentId: string, pressure: ContextPressure) => void;
  setSharedKeys: (keys: SharedMemoryKey[]) => void;
  addSharedKey: (key: SharedMemoryKey) => void;
  markStale: (key: string) => void;
  addConflict: (conflict: MemoryConflict) => void;
  removeEntry: (agentId: string, key: string) => void;
  updateHeat: (agentId: string, key: string, heat: number) => void;
  getTierSummary: (agentId: string) => MemoryTierSummary[];
}

export const useMemoryStore = create<MemoryState>((set, get) => ({
  entries: new Map(),
  pressure: new Map(),
  sharedKeys: [],
  migrations: [],
  conflicts: [],

  setEntries: (agentId, entries) =>
    set((state) => {
      const next = new Map(state.entries);
      next.set(agentId, entries);
      return { entries: next };
    }),

  addEntry: (agentId, entry) =>
    set((state) => {
      const next = new Map(state.entries);
      const existing = next.get(agentId) ?? [];
      // Replace if same key exists, otherwise append
      const idx = existing.findIndex((e) => e.key === entry.key);
      if (idx >= 0) {
        const updated = [...existing];
        updated[idx] = entry;
        next.set(agentId, updated);
      } else {
        next.set(agentId, [...existing, entry]);
      }
      return { entries: next };
    }),

  migrateEntry: (agentId, key, toTier, reason) =>
    set((state) => {
      const next = new Map(state.entries);
      const entries = next.get(agentId) ?? [];
      const idx = entries.findIndex((e) => e.key === key);
      if (idx >= 0) {
        const updated = [...entries];
        const fromTier = updated[idx].tier;
        updated[idx] = { ...updated[idx], tier: toTier, lastAccessed: new Date().toISOString() };
        next.set(agentId, updated);
        const migration: MemoryMigrationEvent = {
          key,
          fromTier,
          toTier,
          agentId,
          reason,
          timestamp: new Date().toISOString(),
        };
        return {
          entries: next,
          migrations: [...state.migrations.slice(-99), migration],
        };
      }
      return state;
    }),

  updatePressure: (agentId, pressure) =>
    set((state) => {
      const next = new Map(state.pressure);
      next.set(agentId, pressure);
      return { pressure: next };
    }),

  setSharedKeys: (keys) => set({ sharedKeys: keys }),

  addSharedKey: (key) =>
    set((state) => {
      const idx = state.sharedKeys.findIndex((k) => k.key === key.key);
      if (idx >= 0) {
        const updated = [...state.sharedKeys];
        updated[idx] = key;
        return { sharedKeys: updated };
      }
      return { sharedKeys: [...state.sharedKeys, key] };
    }),

  markStale: (key) =>
    set((state) => {
      const updated = state.sharedKeys.map((k) =>
        k.key === key ? { ...k, stale: true } : k
      );
      return { sharedKeys: updated };
    }),

  addConflict: (conflict) =>
    set((state) => ({
      conflicts: [...state.conflicts.slice(-49), conflict],
    })),

  removeEntry: (agentId, key) =>
    set((state) => {
      const next = new Map(state.entries);
      const entries = next.get(agentId) ?? [];
      next.set(agentId, entries.filter((e) => e.key !== key));
      return { entries: next };
    }),

  updateHeat: (agentId, key, heat) =>
    set((state) => {
      const next = new Map(state.entries);
      const entries = next.get(agentId) ?? [];
      const idx = entries.findIndex((e) => e.key === key);
      if (idx >= 0) {
        const updated = [...entries];
        updated[idx] = { ...updated[idx], heat };
        next.set(agentId, updated);
      }
      return { entries: next };
    }),

  getTierSummary: (agentId) => {
    const entries = get().entries.get(agentId) ?? [];
    const tiers: MemoryTier[] = ["stm", "mtm", "ltm"];
    return tiers.map((tier) => {
      const tierEntries = entries.filter((e) => e.tier === tier);
      const totalTokens = tierEntries.reduce((s, e) => s + (e.value.length / 4), 0); // rough estimate
      const maxTokens = tier === "stm" ? 8000 : tier === "mtm" ? 32000 : 128000;
      return { tier, entryCount: tierEntries.length, totalTokens: Math.round(totalTokens), maxTokens };
    });
  },
}));
