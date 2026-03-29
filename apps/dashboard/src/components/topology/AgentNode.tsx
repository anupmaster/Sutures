"use client";

import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { STATE_COLORS } from "@/lib/constants";
import type { AgentState } from "@/lib/types";

interface AgentNodeData {
  name: string;
  model: string;
  state: AgentState;
  turnCount: number;
  cumulativeCost: number;
  progress?: number;
  [key: string]: unknown;
}

function AgentNodeComponent({ data }: NodeProps) {
  const { name, model, state, turnCount, cumulativeCost, progress } =
    data as unknown as AgentNodeData;
  const stateColor = STATE_COLORS[state] ?? STATE_COLORS.idle;
  const isPaused = state === "paused";

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2 !h-2 !border-0"
        style={{ background: stateColor }}
      />
      <div
        className="w-[220px] rounded-lg border px-3 py-2.5 font-body text-sm select-none"
        style={{
          backgroundColor: "#1A1A1D",
          borderColor: stateColor,
          borderWidth: isPaused ? "2px" : "1px",
        }}
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
              style={{
                backgroundColor: stateColor,
                boxShadow:
                  state === "thinking" || state === "acting"
                    ? `0 0 8px ${stateColor}`
                    : undefined,
              }}
            />
            <span
              className="font-display font-semibold text-[13px] truncate"
              style={{ color: "#F5F5F5" }}
            >
              {name}
            </span>
          </div>
          <span
            className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-display font-medium"
            style={{
              backgroundColor: "#222225",
              color: "#A1A1AA",
            }}
          >
            {turnCount}
          </span>
        </div>

        {/* Model */}
        <div
          className="font-display text-[11px] mb-1.5 truncate"
          style={{ color: "#71717A" }}
        >
          {model}
        </div>

        {/* Progress bar */}
        {progress != null && (
          <div
            className="w-full h-1.5 rounded-full mb-1.5 overflow-hidden"
            style={{ backgroundColor: "#222225" }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, Math.max(0, progress * 100))}%`,
                backgroundColor: stateColor,
              }}
            />
          </div>
        )}

        {/* Cost */}
        <div
          className="font-display text-[11px]"
          style={{ color: "#A1A1AA" }}
        >
          ${cumulativeCost.toFixed(4)}
        </div>

        {/* Paused indicator */}
        {isPaused && (
          <div className="flex items-center gap-1.5 mt-1.5">
            <span className="w-2 h-2 rounded-full bg-[#EF4444] animate-pulse" />
            <span
              className="font-display text-[10px] font-bold uppercase tracking-wider"
              style={{ color: "#EF4444" }}
            >
              Paused
            </span>
          </div>
        )}
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !border-0"
        style={{ background: stateColor }}
      />
    </>
  );
}

export const AgentNode = memo(AgentNodeComponent);
AgentNode.displayName = "AgentNode";
