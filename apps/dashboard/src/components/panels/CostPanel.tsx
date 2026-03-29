"use client";

import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useSwarmStore } from "@/stores/swarmStore";

const AGENT_COLORS = [
  "#10B981",
  "#3B82F6",
  "#F59E0B",
  "#8B5CF6",
  "#EF4444",
  "#EC4899",
  "#06B6D4",
  "#F97316",
];

interface CostTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; payload: { name: string; model: string } }>;
}

function CostTooltip({ active, payload }: CostTooltipProps) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div
      className="rounded px-3 py-2 text-xs font-body"
      style={{
        backgroundColor: "#1A1A1D",
        border: "1px solid #222225",
      }}
    >
      <div className="font-display font-semibold" style={{ color: "#F5F5F5" }}>
        {item.payload.name}
      </div>
      <div style={{ color: "#71717A" }}>{item.payload.model}</div>
      <div className="mt-1 font-display font-semibold" style={{ color: "#10B981" }}>
        ${item.value.toFixed(4)}
      </div>
    </div>
  );
}

export function CostPanel() {
  const agents = useSwarmStore((s) => s.agents);
  const totalCost = useSwarmStore((s) => s.totalCost);

  const chartData = useMemo(() => {
    return Array.from(agents.values())
      .map((a) => ({
        name: a.name,
        model: a.model,
        cost: a.cumulativeCost,
      }))
      .sort((a, b) => b.cost - a.cost);
  }, [agents]);

  const modelBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const a of agents.values()) {
      map.set(a.model, (map.get(a.model) ?? 0) + a.cumulativeCost);
    }
    return Array.from(map.entries())
      .map(([model, cost]) => ({ model, cost }))
      .sort((a, b) => b.cost - a.cost);
  }, [agents]);

  return (
    <div className="h-full flex font-body text-xs overflow-hidden">
      {/* Chart area */}
      <div className="flex-1 flex flex-col p-3">
        <div className="flex items-center justify-between mb-2">
          <span
            className="font-display text-[11px] font-medium uppercase tracking-wider"
            style={{ color: "#71717A" }}
          >
            Cost by Agent
          </span>
          <span
            className="font-display text-sm font-bold"
            style={{ color: "#10B981" }}
          >
            ${totalCost.toFixed(4)}
          </span>
        </div>
        <div className="flex-1 min-h-0">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#222225" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, fill: "#71717A", fontFamily: "JetBrains Mono" }}
                  axisLine={{ stroke: "#222225" }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "#71717A", fontFamily: "JetBrains Mono" }}
                  axisLine={{ stroke: "#222225" }}
                  tickLine={false}
                  tickFormatter={(v: number) => `$${v.toFixed(3)}`}
                />
                <Tooltip content={<CostTooltip />} cursor={{ fill: "#222225" }} />
                <Bar dataKey="cost" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={AGENT_COLORS[i % AGENT_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div
              className="flex items-center justify-center h-full"
              style={{ color: "#71717A" }}
            >
              No cost data yet
            </div>
          )}
        </div>
      </div>

      {/* Model breakdown sidebar */}
      <div
        className="w-[200px] border-l p-3 overflow-y-auto shrink-0"
        style={{ borderColor: "#222225" }}
      >
        <div
          className="font-display text-[10px] font-medium uppercase tracking-wider mb-2"
          style={{ color: "#71717A" }}
        >
          By Model
        </div>
        {modelBreakdown.length === 0 ? (
          <div style={{ color: "#71717A" }}>No data</div>
        ) : (
          <div className="space-y-2">
            {modelBreakdown.map((m) => (
              <div key={m.model}>
                <div className="flex items-center justify-between">
                  <span
                    className="font-display text-[11px] truncate"
                    style={{ color: "#F5F5F5" }}
                  >
                    {m.model}
                  </span>
                  <span
                    className="font-display text-[11px] font-semibold shrink-0 ml-2"
                    style={{ color: "#A1A1AA" }}
                  >
                    ${m.cost.toFixed(4)}
                  </span>
                </div>
                <div
                  className="w-full h-1 rounded-full mt-1 overflow-hidden"
                  style={{ backgroundColor: "#222225" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width:
                        totalCost > 0
                          ? `${(m.cost / totalCost) * 100}%`
                          : "0%",
                      backgroundColor: "#10B981",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
