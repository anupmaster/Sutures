"use client";

import { useMemo, useCallback, useState } from "react";
import type { Node, Edge } from "@xyflow/react";
import { useMemoryStore } from "@/stores/memoryStore";
import { useSwarmStore } from "@/stores/swarmStore";
import { MEMORY_COLORS } from "@/lib/constants";
import type { MemoryEntry, MemoryTier } from "@/lib/types";

/** Max agent nodes before auto-disabling overlay (perf gate). */
const LITE_MODE_THRESHOLD = 20;

/** Vertical offset below agent nodes so memory nodes cluster nearby. */
const MEMORY_Y_OFFSET = 180;
const MEMORY_X_SPACING = 90;

/**
 * Classify a memory entry into a G-Memory type based on key/value heuristics.
 * In a real system the adapter would tag these; here we infer from naming.
 */
function classifyMemoryType(entry: MemoryEntry): "insight" | "query" | "interaction" {
  const lower = entry.key.toLowerCase();
  if (lower.includes("insight") || lower.includes("finding") || lower.includes("result")) {
    return "insight";
  }
  if (lower.includes("query") || lower.includes("search") || lower.includes("question")) {
    return "query";
  }
  return "interaction";
}

const TIER_EDGE_COLORS: Record<MemoryTier, string> = {
  stm: MEMORY_COLORS.stm,
  mtm: MEMORY_COLORS.mtm,
  ltm: MEMORY_COLORS.ltm,
};

interface GMemoryOverlayResult {
  memoryNodes: Node[];
  memoryEdges: Edge[];
  isEnabled: boolean;
  isAutoDisabled: boolean;
  toggle: () => void;
}

export function useGMemoryOverlay(agentNodeCount: number): GMemoryOverlayResult {
  const [userEnabled, setUserEnabled] = useState(false);
  const entries = useMemoryStore((s) => s.entries);
  const sharedKeys = useMemoryStore((s) => s.sharedKeys);
  const agents = useSwarmStore((s) => s.agents);

  const isAutoDisabled = agentNodeCount > LITE_MODE_THRESHOLD;
  const isEnabled = userEnabled && !isAutoDisabled;

  const toggle = useCallback(() => {
    setUserEnabled((prev) => !prev);
  }, []);

  const { memoryNodes, memoryEdges } = useMemo(() => {
    if (!isEnabled) {
      return { memoryNodes: [] as Node[], memoryEdges: [] as Edge[] };
    }

    const nodes: Node[] = [];
    const edges: Edge[] = [];
    const seenKeys = new Set<string>();

    // Build a lookup: shared key -> reader agent ids
    const sharedKeyReaders = new Map<string, string[]>();
    for (const sk of sharedKeys) {
      sharedKeyReaders.set(sk.key, sk.readerAgentIds);
    }

    // Iterate per-agent memory entries
    let globalIdx = 0;
    for (const [agentId, agentEntries] of entries) {
      for (let i = 0; i < agentEntries.length; i++) {
        const entry = agentEntries[i];
        const memNodeId = `mem-${entry.key}`;

        // Deduplicate shared entries — only create node once
        if (!seenKeys.has(entry.key)) {
          seenKeys.add(entry.key);

          const memType = classifyMemoryType(entry);

          nodes.push({
            id: memNodeId,
            type: "memoryNode",
            position: {
              x: globalIdx * MEMORY_X_SPACING,
              y: MEMORY_Y_OFFSET + (globalIdx % 3) * 40,
            },
            data: {
              key: entry.key,
              tier: entry.tier,
              heat: entry.heat,
              shared: entry.shared,
              type: memType,
            },
            style: { width: 64, height: 64 },
            // z-index below agent nodes
            zIndex: -1,
          });
          globalIdx++;
        }

        // Edge: agent -> memory (write relationship)
        edges.push({
          id: `mem-edge-write-${agentId}-${entry.key}`,
          source: agentId,
          target: memNodeId,
          type: "default",
          animated: false,
          style: {
            stroke: TIER_EDGE_COLORS[entry.tier],
            strokeWidth: 1,
            strokeDasharray: "4 3",
            opacity: 0.5,
          },
        });

        // Edges: memory -> reader agents (read relationship for shared keys)
        const readers = sharedKeyReaders.get(entry.key);
        if (readers) {
          for (const readerId of readers) {
            if (readerId === agentId) continue; // skip self
            if (!agents.has(readerId)) continue; // reader not in topology
            edges.push({
              id: `mem-edge-read-${readerId}-${entry.key}`,
              source: memNodeId,
              target: readerId,
              type: "default",
              animated: false,
              style: {
                stroke: entry.shared ? MEMORY_COLORS.shared : TIER_EDGE_COLORS[entry.tier],
                strokeWidth: 1,
                strokeDasharray: "6 4",
                opacity: 0.4,
              },
            });
          }
        }
      }
    }

    return { memoryNodes: nodes, memoryEdges: edges };
  }, [isEnabled, entries, sharedKeys, agents]);

  return { memoryNodes, memoryEdges, isEnabled, isAutoDisabled, toggle };
}
