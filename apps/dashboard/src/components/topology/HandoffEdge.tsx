"use client";

import React, { memo } from "react";
import {
  BaseEdge,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import { HANDOFF_COLORS } from "@/lib/constants";

interface HandoffEdgeData {
  handoffType: string;
  active: boolean;
  label?: string;
  [key: string]: unknown;
}

function HandoffEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style,
}: EdgeProps) {
  const { handoffType, active, label } = (data ?? {}) as HandoffEdgeData;
  const color = HANDOFF_COLORS[handoffType] ?? "#6B7280";

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          stroke: color,
          strokeWidth: active ? 2 : 1.5,
          strokeDasharray: active ? "6 3" : undefined,
          opacity: active ? 1 : 0.6,
        }}
      />
      {active && (
        <circle r="3" fill={color}>
          <animateMotion dur="1.5s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
      {label && (
        <text
          x={labelX}
          y={labelY - 8}
          textAnchor="middle"
          dominantBaseline="auto"
          className="fill-current"
          style={{
            fontSize: 10,
            fontFamily: "JetBrains Mono, monospace",
            fill: "#A1A1AA",
          }}
        >
          {label}
        </text>
      )}
    </>
  );
}

export const HandoffEdge = memo(HandoffEdgeComponent);
HandoffEdge.displayName = "HandoffEdge";
