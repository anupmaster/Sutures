"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Node, Edge } from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import { useSwarmStore } from "@/stores/swarmStore";
import { STATE_COLORS, HANDOFF_COLORS, ELK_LAYOUT_THROTTLE_MS } from "@/lib/constants";
import type { AgentInfo, HandoffEdgeData } from "@/lib/types";

const elk = new ELK();

const ELK_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.spacing.nodeNode": "80",
  "elk.layered.spacing.nodeNodeBetweenLayers": "120",
  "elk.layered.crossingMinimization.strategy": "LAYER_SWEEP",
};

const NODE_WIDTH = 220;
const NODE_HEIGHT = 130;

function agentToNode(agent: AgentInfo): Node {
  return {
    id: agent.id,
    type: "agentNode",
    position: { x: 0, y: 0 },
    data: {
      name: agent.name,
      model: agent.model,
      state: agent.state,
      turnCount: agent.turnCount,
      cumulativeCost: agent.cumulativeCost,
      progress: agent.progress,
    },
    style: {
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
    },
  };
}

function handoffToEdge(edge: HandoffEdgeData): Edge {
  return {
    id: edge.id,
    source: edge.sourceAgentId,
    target: edge.targetAgentId,
    type: "handoffEdge",
    animated: edge.active,
    data: {
      handoffType: edge.type,
      active: edge.active,
      label: edge.label,
    },
    style: {
      stroke: HANDOFF_COLORS[edge.type] ?? STATE_COLORS.idle,
    },
  };
}

interface TopologyResult {
  nodes: Node[];
  edges: Edge[];
  isLayouting: boolean;
}

export function useTopology(): TopologyResult {
  const agents = useSwarmStore((s) => s.agents);
  const storeEdges = useSwarmStore((s) => s.edges);
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [isLayouting, setIsLayouting] = useState(false);
  const lastLayoutRef = useRef(0);
  const pendingRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyLayout = useCallback(
    async (agentList: AgentInfo[], edgeList: HandoffEdgeData[]) => {
      if (agentList.length === 0) {
        setNodes([]);
        setEdges([]);
        return;
      }

      setIsLayouting(true);

      try {
        const graph = {
          id: "root",
          layoutOptions: ELK_OPTIONS,
          children: agentList.map((a) => ({
            id: a.id,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
          })),
          edges: edgeList.map((e) => ({
            id: e.id,
            sources: [e.sourceAgentId],
            targets: [e.targetAgentId],
          })),
        };

        const layout = await elk.layout(graph);

        const layoutNodes = agentList.map((agent) => {
          const elkNode = layout.children?.find((c) => c.id === agent.id);
          const node = agentToNode(agent);
          if (elkNode) {
            node.position = { x: elkNode.x ?? 0, y: elkNode.y ?? 0 };
          }
          return node;
        });

        const layoutEdges = edgeList.map(handoffToEdge);

        setNodes(layoutNodes);
        setEdges(layoutEdges);
      } catch {
        // Fallback: grid layout
        const layoutNodes = agentList.map((agent, i) => {
          const node = agentToNode(agent);
          const cols = Math.ceil(Math.sqrt(agentList.length));
          node.position = {
            x: (i % cols) * (NODE_WIDTH + 80),
            y: Math.floor(i / cols) * (NODE_HEIGHT + 80),
          };
          return node;
        });
        setNodes(layoutNodes);
        setEdges(edgeList.map(handoffToEdge));
      } finally {
        setIsLayouting(false);
        lastLayoutRef.current = Date.now();
      }
    },
    []
  );

  const scheduleLayout = useCallback(
    (agentList: AgentInfo[], edgeList: HandoffEdgeData[]) => {
      const now = Date.now();
      const elapsed = now - lastLayoutRef.current;

      if (elapsed >= ELK_LAYOUT_THROTTLE_MS) {
        applyLayout(agentList, edgeList);
      } else {
        if (pendingRef.current) return;
        pendingRef.current = true;
        timeoutRef.current = setTimeout(() => {
          pendingRef.current = false;
          const currentAgents = Array.from(
            useSwarmStore.getState().agents.values()
          );
          const currentEdges = useSwarmStore.getState().edges;
          applyLayout(currentAgents, currentEdges);
        }, ELK_LAYOUT_THROTTLE_MS - elapsed);
      }
    },
    [applyLayout]
  );

  useEffect(() => {
    const agentList = Array.from(agents.values());
    scheduleLayout(agentList, storeEdges);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [agents, storeEdges, scheduleLayout]);

  return { nodes, edges, isLayouting };
}
