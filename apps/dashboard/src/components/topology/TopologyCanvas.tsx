"use client";

import React, { useCallback, useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type NodeTypes,
  type EdgeTypes,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AgentNode } from "./AgentNode";
import { HandoffEdge } from "./HandoffEdge";
import { useTopology } from "@/hooks/useTopology";
import { useSwarmStore } from "@/stores/swarmStore";

const nodeTypes: NodeTypes = {
  agentNode: AgentNode,
};

const edgeTypes: EdgeTypes = {
  handoffEdge: HandoffEdge,
};

const defaultEdgeOptions = {
  type: "handoffEdge",
};

const proOptions = {
  hideAttribution: true,
};

export function TopologyCanvas() {
  const { nodes, edges } = useTopology();
  const setSelectedAgent = useSwarmStore((s) => s.setSelectedAgent);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedAgent(node.id);
    },
    [setSelectedAgent]
  );

  const onPaneClick = useCallback(() => {
    setSelectedAgent(null);
  }, [setSelectedAgent]);

  const minimapStyle = useMemo(
    () => ({
      height: 80,
      width: 120,
    }),
    []
  );

  return (
    <div className="w-full h-full" style={{ backgroundColor: "#111113" }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        proOptions={proOptions}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.1}
        maxZoom={2}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="#333336"
        />
        <Controls
          showInteractive={false}
          position="bottom-left"
        />
        <MiniMap
          style={minimapStyle}
          position="bottom-right"
          pannable
          zoomable
          nodeColor={(node) => {
            const state = (node.data as Record<string, unknown>)?.state as string;
            const colors: Record<string, string> = {
              idle: "#6B7280",
              thinking: "#F59E0B",
              acting: "#3B82F6",
              paused: "#EF4444",
              completed: "#10B981",
            };
            return colors[state] ?? "#6B7280";
          }}
          maskColor="rgba(10, 10, 11, 0.8)"
        />
      </ReactFlow>
    </div>
  );
}
