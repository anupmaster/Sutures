"use client";

import React, { useCallback, useMemo, useState } from "react";
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
import { Play, Loader2 } from "lucide-react";
import { AgentNode } from "./AgentNode";
import { HandoffEdge } from "./HandoffEdge";
import { useTopology } from "@/hooks/useTopology";
import { useSwarmStore } from "@/stores/swarmStore";
import { HTTP_PORT } from "@/lib/constants";

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

function EmptyState() {
  const [loading, setLoading] = useState(false);
  const [ran, setRan] = useState(false);

  const runDemo = async () => {
    setLoading(true);
    try {
      await fetch(`http://localhost:${HTTP_PORT}/api/simulate`, { method: 'POST' });
      setRan(true);
    } catch {
      // collector might not be running
    } finally {
      setLoading(false);
    }
  };

  if (ran) return null;

  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto flex flex-col items-center gap-5 text-center max-w-md px-6">
        <div
          className="w-14 h-14 rounded-xl flex items-center justify-center text-lg font-display font-bold"
          style={{ backgroundColor: "#10B98120", color: "#10B981" }}
        >
          S
        </div>
        <div>
          <h2
            className="text-lg font-display font-semibold mb-1"
            style={{ color: "#F5F5F5" }}
          >
            No agents running
          </h2>
          <p className="text-xs leading-relaxed" style={{ color: "#71717A" }}>
            Connect your agent framework via WebSocket on port 9470, or run a
            demo to see Sutures in action.
          </p>
        </div>
        <button
          onClick={runDemo}
          disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-display font-semibold transition-all hover:brightness-110 disabled:opacity-60"
          style={{
            backgroundColor: "#10B981",
            color: "#0A0A0B",
          }}
        >
          {loading ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Play size={14} />
          )}
          {loading ? "Starting simulation..." : "Run Demo Simulation"}
        </button>
        <p className="text-[10px]" style={{ color: "#71717A" }}>
          3-agent research swarm — Researcher, Critic, Writer
        </p>
      </div>
    </div>
  );
}

export function TopologyCanvas() {
  const { nodes, edges } = useTopology();
  const agents = useSwarmStore((s) => s.agents);
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

  const isEmpty = agents.size === 0;

  return (
    <div className="w-full h-full relative" style={{ backgroundColor: "#111113" }}>
      {isEmpty && <EmptyState />}
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
