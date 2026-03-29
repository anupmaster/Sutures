"use client";

import React, { useState, useMemo } from "react";
import { X } from "lucide-react";
import { useSwarmStore } from "@/stores/swarmStore";
import { STATE_COLORS } from "@/lib/constants";
import { ContextViewer } from "./ContextViewer";
import { ToolCallLog } from "./ToolCallLog";

type InspectorTab = "context" | "tools";

export function AgentInspector() {
  const selectedAgentId = useSwarmStore((s) => s.selectedAgentId);
  const agents = useSwarmStore((s) => s.agents);
  const setSelectedAgent = useSwarmStore((s) => s.setSelectedAgent);
  const [activeTab, setActiveTab] = useState<InspectorTab>("context");

  const agent = useMemo(
    () => (selectedAgentId ? agents.get(selectedAgentId) : null),
    [selectedAgentId, agents]
  );

  if (!agent) {
    return (
      <div
        className="h-full flex items-center justify-center font-body text-sm"
        style={{ backgroundColor: "#111113", color: "#71717A" }}
      >
        Select an agent to inspect
      </div>
    );
  }

  const stateColor = STATE_COLORS[agent.state];

  return (
    <div
      className="h-full flex flex-col overflow-hidden"
      style={{ backgroundColor: "#111113" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 border-b shrink-0"
        style={{ borderColor: "#222225" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="w-3 h-3 rounded-full shrink-0"
            style={{ backgroundColor: stateColor }}
          />
          <div className="min-w-0">
            <h2
              className="font-display text-sm font-semibold truncate"
              style={{ color: "#F5F5F5" }}
            >
              {agent.name}
            </h2>
            <p
              className="font-display text-[11px] truncate"
              style={{ color: "#71717A" }}
            >
              {agent.model}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="px-2 py-0.5 rounded text-[10px] font-display font-semibold uppercase tracking-wider"
            style={{
              backgroundColor: `${stateColor}20`,
              color: stateColor,
            }}
          >
            {agent.state}
          </span>
          <button
            onClick={() => setSelectedAgent(null)}
            className="p-1 rounded hover:bg-[#222225] transition-colors"
          >
            <X size={14} style={{ color: "#71717A" }} />
          </button>
        </div>
      </div>

      {/* Stats row */}
      <div
        className="grid grid-cols-3 gap-px shrink-0"
        style={{ backgroundColor: "#222225" }}
      >
        {[
          { label: "Turns", value: String(agent.turnCount) },
          { label: "Cost", value: `$${agent.cumulativeCost.toFixed(4)}` },
          {
            label: "Tools",
            value: String(agent.toolCalls.length),
          },
        ].map((stat) => (
          <div
            key={stat.label}
            className="px-3 py-2 text-center"
            style={{ backgroundColor: "#111113" }}
          >
            <div
              className="font-display text-xs font-semibold"
              style={{ color: "#F5F5F5" }}
            >
              {stat.value}
            </div>
            <div
              className="text-[10px] font-body"
              style={{ color: "#71717A" }}
            >
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div
        className="flex border-b shrink-0"
        style={{ borderColor: "#222225" }}
      >
        {(["context", "tools"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 px-4 py-2 text-xs font-display font-medium uppercase tracking-wider transition-colors"
            style={{
              color: activeTab === tab ? "#10B981" : "#71717A",
              borderBottom:
                activeTab === tab ? "2px solid #10B981" : "2px solid transparent",
              backgroundColor: "transparent",
            }}
          >
            {tab === "context" ? "Context" : "Tool Calls"}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "context" ? (
          <ContextViewer messages={agent.contextMessages} />
        ) : (
          <ToolCallLog toolCalls={agent.toolCalls} />
        )}
      </div>
    </div>
  );
}
