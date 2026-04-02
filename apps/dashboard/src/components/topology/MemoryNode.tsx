"use client";

import React, { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MEMORY_COLORS } from "@/lib/constants";
import type { MemoryTier } from "@/lib/types";

export interface MemoryNodeData {
  key: string;
  tier: MemoryTier;
  heat: number; // 0-1
  shared: boolean;
  type: "insight" | "query" | "interaction";
  [k: string]: unknown;
}

const TYPE_COLORS: Record<string, string> = {
  insight: "#8B5CF6",
  query: "#3B82F6",
  interaction: "#10B981",
};

const TYPE_LABELS: Record<string, string> = {
  insight: "INS",
  query: "QRY",
  interaction: "INT",
};

const TIER_LABELS: Record<MemoryTier, string> = {
  stm: "STM",
  mtm: "MTM",
  ltm: "LTM",
};

function MemoryNodeComponent({ data }: NodeProps) {
  const { key: entryKey, tier, heat, type: memType } =
    data as unknown as MemoryNodeData;
  const nodeColor = TYPE_COLORS[memType] ?? "#8B5CF6";
  const tierColor = MEMORY_COLORS[tier] ?? MEMORY_COLORS.stm;

  // Heat indicator: 0 = cold (dim), 1 = hot (bright)
  const heatOpacity = 0.3 + heat * 0.7;

  return (
    <>
      <Handle
        type="target"
        position={Position.Left}
        className="!w-1.5 !h-1.5 !border-0"
        style={{ background: nodeColor, opacity: 0.6 }}
      />
      <div
        className="flex flex-col items-center justify-center rounded-full select-none"
        style={{
          width: 64,
          height: 64,
          backgroundColor: `${nodeColor}18`,
          border: `1.5px solid ${nodeColor}`,
          opacity: heatOpacity,
        }}
      >
        {/* Type badge */}
        <span
          className="font-display text-[9px] font-bold tracking-wider"
          style={{ color: nodeColor }}
        >
          {TYPE_LABELS[memType] ?? "MEM"}
        </span>

        {/* Key name — truncated */}
        <span
          className="font-display text-[10px] font-medium truncate max-w-[52px] text-center leading-tight"
          style={{ color: "#F5F5F5" }}
        >
          {entryKey}
        </span>

        {/* Tier pill */}
        <span
          className="font-display text-[8px] font-semibold px-1 rounded mt-0.5"
          style={{
            backgroundColor: `${tierColor}30`,
            color: tierColor,
          }}
        >
          {TIER_LABELS[tier]}
        </span>
      </div>
      <Handle
        type="source"
        position={Position.Right}
        className="!w-1.5 !h-1.5 !border-0"
        style={{ background: nodeColor, opacity: 0.6 }}
      />
    </>
  );
}

export const MemoryNode = memo(MemoryNodeComponent);
MemoryNode.displayName = "MemoryNode";
