"use client";

import React, { useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { useSwarmStore } from "@/stores/swarmStore";
import { useEventStore } from "@/stores/eventStore";

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

type CostView = "agents" | "timeline" | "budget";

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
      {item.payload.model && (
        <div style={{ color: "#71717A" }}>{item.payload.model}</div>
      )}
      <div className="mt-1 font-display font-semibold" style={{ color: "#10B981" }}>
        ${item.value.toFixed(4)}
      </div>
    </div>
  );
}

export function CostPanel() {
  const agents = useSwarmStore((s) => s.agents);
  const totalCost = useSwarmStore((s) => s.totalCost);
  const events = useEventStore((s) => s.events);
  const [view, setView] = useState<CostView>("agents");
  const [budgetLimit, setBudgetLimit] = useState(1.0);

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

  // Time-series: cumulative cost over time from cost events
  const timeSeriesData = useMemo(() => {
    const costEvents = events.filter(
      (e) => e.type === "cost.tokens" || e.type === "cost.api_call"
    );
    let cumulative = 0;
    return costEvents.map((e) => {
      const cost = (e.payload.cost_usd as number) ?? 0;
      cumulative += cost;
      return {
        time: new Date(e.timestamp).toLocaleTimeString(undefined, {
          hour12: false,
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
        }),
        name: e.agentName,
        model: "",
        cost: cumulative,
        increment: cost,
      };
    });
  }, [events]);

  const budgetPct = budgetLimit > 0 ? Math.min(100, (totalCost / budgetLimit) * 100) : 0;
  const budgetColor = budgetPct < 60 ? "#10B981" : budgetPct < 85 ? "#F59E0B" : "#EF4444";

  const views: { id: CostView; label: string }[] = [
    { id: "agents", label: "By Agent" },
    { id: "timeline", label: "Over Time" },
    { id: "budget", label: "Budget" },
  ];

  return (
    <div className="h-full flex font-body text-xs overflow-hidden">
      {/* Chart area */}
      <div className="flex-1 flex flex-col p-3">
        {/* Header with view toggle */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1">
            {views.map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                className="px-2 py-0.5 rounded text-[9px] font-display font-semibold uppercase tracking-wider transition-colors"
                style={{
                  backgroundColor: view === v.id ? "#10B98120" : "transparent",
                  color: view === v.id ? "#10B981" : "#71717A",
                }}
              >
                {v.label}
              </button>
            ))}
          </div>
          <span
            className="font-display text-sm font-bold"
            style={{ color: "#10B981" }}
          >
            ${totalCost.toFixed(4)}
          </span>
        </div>

        <div className="flex-1 min-h-0">
          {view === "agents" && (
            chartData.length > 0 ? (
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
              <div className="flex items-center justify-center h-full" style={{ color: "#71717A" }}>
                No cost data yet
              </div>
            )
          )}

          {view === "timeline" && (
            timeSeriesData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timeSeriesData} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222225" />
                  <XAxis
                    dataKey="time"
                    tick={{ fontSize: 9, fill: "#71717A", fontFamily: "JetBrains Mono" }}
                    axisLine={{ stroke: "#222225" }}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "#71717A", fontFamily: "JetBrains Mono" }}
                    axisLine={{ stroke: "#222225" }}
                    tickLine={false}
                    tickFormatter={(v: number) => `$${v.toFixed(3)}`}
                  />
                  <Tooltip content={<CostTooltip />} cursor={{ stroke: "#222225" }} />
                  <Line
                    type="monotone"
                    dataKey="cost"
                    stroke="#10B981"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: "#10B981" }}
                  />
                  {budgetLimit > 0 && (
                    <Line
                      type="monotone"
                      dataKey={() => budgetLimit}
                      stroke="#EF4444"
                      strokeWidth={1}
                      strokeDasharray="5 5"
                      dot={false}
                      activeDot={false}
                    />
                  )}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full" style={{ color: "#71717A" }}>
                No cost events yet
              </div>
            )
          )}

          {view === "budget" && (
            <div className="flex flex-col gap-4 py-4 px-2">
              {/* Budget bar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="font-display text-[11px] font-semibold" style={{ color: "#F5F5F5" }}>
                    Budget Usage
                  </span>
                  <span className="font-display text-[11px]" style={{ color: budgetColor }}>
                    {budgetPct.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full h-4 rounded-full overflow-hidden" style={{ backgroundColor: "#222225" }}>
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${budgetPct}%`,
                      backgroundColor: budgetColor,
                      boxShadow: budgetPct > 85 ? `0 0 12px ${budgetColor}60` : undefined,
                    }}
                  />
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] font-display" style={{ color: "#71717A" }}>
                    ${totalCost.toFixed(4)} spent
                  </span>
                  <span className="text-[10px] font-display" style={{ color: "#71717A" }}>
                    ${budgetLimit.toFixed(2)} limit
                  </span>
                </div>
              </div>

              {/* Budget input */}
              <div>
                <label className="text-[10px] font-display font-medium uppercase tracking-wider block mb-1" style={{ color: "#71717A" }}>
                  Set Budget Limit ($)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={budgetLimit}
                  onChange={(e) => setBudgetLimit(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full rounded px-2 py-1.5 text-xs font-body outline-none"
                  style={{
                    backgroundColor: "#222225",
                    color: "#F5F5F5",
                    border: "1px solid #333336",
                  }}
                />
              </div>

              {/* Budget alert */}
              {budgetPct >= 85 && (
                <div
                  className="rounded-lg p-2.5"
                  style={{ backgroundColor: "#EF444410", border: "1px solid #EF444430" }}
                >
                  <div className="text-[11px] font-display font-semibold" style={{ color: "#EF4444" }}>
                    Budget Alert
                  </div>
                  <p className="text-[10px] font-body mt-0.5" style={{ color: "#A1A1AA" }}>
                    Spending has reached {budgetPct.toFixed(0)}% of the ${budgetLimit.toFixed(2)} budget.
                    {budgetPct >= 100 ? " Budget exceeded!" : " Consider pausing non-critical agents."}
                  </p>
                </div>
              )}

              {/* Per-agent breakdown */}
              <div>
                <div className="text-[10px] font-display font-medium uppercase tracking-wider mb-1.5" style={{ color: "#71717A" }}>
                  Per-Agent Spending
                </div>
                {chartData.map((d, i) => (
                  <div key={d.name} className="flex items-center gap-2 py-1">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: AGENT_COLORS[i % AGENT_COLORS.length] }}
                    />
                    <span className="text-[11px] font-display flex-1 truncate" style={{ color: "#F5F5F5" }}>
                      {d.name}
                    </span>
                    <span className="text-[10px] font-display shrink-0" style={{ color: "#A1A1AA" }}>
                      ${d.cost.toFixed(4)}
                    </span>
                    <span className="text-[9px] font-display shrink-0" style={{ color: "#71717A" }}>
                      {budgetLimit > 0 ? `${((d.cost / budgetLimit) * 100).toFixed(0)}%` : ""}
                    </span>
                  </div>
                ))}
              </div>
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
