"use client";

import React, { useMemo, useState } from "react";
import { useMemoryStore } from "@/stores/memoryStore";
import { useSwarmStore } from "@/stores/swarmStore";
import type { MemoryTier, MemoryEntry } from "@/lib/types";

// ── Design tokens from CLAUDE.md ────────────────────
const TIER_COLORS: Record<MemoryTier, { color: string; bg: string; label: string }> = {
  stm: { color: "#10B981", bg: "#10B98120", label: "STM" },
  mtm: { color: "#F59E0B", bg: "#F59E0B20", label: "MTM" },
  ltm: { color: "#8B5CF6", bg: "#8B5CF620", label: "LTM" },
};

const PRESSURE_COLORS = {
  safe: "#10B981",   // 0-60%
  high: "#F59E0B",   // 60-85%
  cliff: "#EF4444",  // 85-100%
};

function getPressureColor(pct: number): string {
  if (pct < 60) return PRESSURE_COLORS.safe;
  if (pct < 85) return PRESSURE_COLORS.high;
  return PRESSURE_COLORS.cliff;
}

function getPressureLabel(pct: number): string {
  if (pct < 60) return "Safe";
  if (pct < 85) return "High";
  return "Cliff";
}

// ── Heat color for pruning heatmap ──────────────────
function getHeatColor(heat: number): string {
  // 0 = cold (prune candidate), 1 = hot (keep)
  if (heat > 0.7) return "#10B981"; // hot — keep
  if (heat > 0.4) return "#F59E0B"; // warm
  return "#EF4444"; // cold — prune candidate
}

// ── Sub-components ──────────────────────────────────

type MemoryTab = "tiers" | "pressure" | "shared" | "migrations";

function TierVisualization({ agentId }: { agentId: string }) {
  const entries = useMemoryStore((s) => s.entries.get(agentId) ?? []);
  const getTierSummary = useMemoryStore((s) => s.getTierSummary);
  const tierSummary = useMemo(() => getTierSummary(agentId), [getTierSummary, agentId]);

  const tiers: MemoryTier[] = ["stm", "mtm", "ltm"];

  return (
    <div className="flex flex-col gap-3 p-3">
      {/* 3-tier columns */}
      <div className="flex gap-2">
        {tiers.map((tier) => {
          const config = TIER_COLORS[tier];
          const summary = tierSummary.find((s) => s.tier === tier);
          const tierEntries = entries.filter((e) => e.tier === tier);
          const fillPct = summary ? Math.min(100, (summary.totalTokens / summary.maxTokens) * 100) : 0;

          return (
            <div
              key={tier}
              className="flex-1 rounded-lg p-2.5"
              style={{ backgroundColor: "#1A1A1D", border: `1px solid ${config.color}30` }}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-2">
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-display font-bold uppercase"
                  style={{ backgroundColor: config.bg, color: config.color }}
                >
                  {config.label}
                </span>
                <span className="text-[10px] font-display" style={{ color: "#71717A" }}>
                  {summary?.entryCount ?? 0} entries
                </span>
              </div>

              {/* Fill bar */}
              <div className="w-full h-1.5 rounded-full overflow-hidden mb-2" style={{ backgroundColor: "#222225" }}>
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${fillPct}%`, backgroundColor: config.color }}
                />
              </div>
              <div className="text-[9px] font-display mb-2" style={{ color: "#71717A" }}>
                {summary?.totalTokens.toLocaleString() ?? 0} / {((summary?.maxTokens ?? 0) / 1000).toFixed(0)}K tokens
              </div>

              {/* Entry list (pruning heatmap) */}
              <div className="space-y-1 max-h-[120px] overflow-y-auto">
                {tierEntries.length === 0 ? (
                  <div className="text-[10px] py-2 text-center" style={{ color: "#71717A" }}>
                    Empty
                  </div>
                ) : (
                  tierEntries.map((entry) => (
                    <div
                      key={entry.key}
                      className="flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px]"
                      style={{ backgroundColor: `${getHeatColor(entry.heat)}10` }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ backgroundColor: getHeatColor(entry.heat) }}
                      />
                      <span className="truncate font-display" style={{ color: "#F5F5F5" }}>
                        {entry.key}
                      </span>
                      {entry.shared && (
                        <span
                          className="ml-auto shrink-0 px-1 rounded text-[8px] font-bold"
                          style={{ backgroundColor: "#3B82F620", color: "#3B82F6" }}
                        >
                          S
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Migration arrows between tiers */}
      <div className="flex items-center justify-center gap-1 text-[10px]" style={{ color: "#71717A" }}>
        <span style={{ color: TIER_COLORS.stm.color }}>STM</span>
        <span>→ FIFO →</span>
        <span style={{ color: TIER_COLORS.mtm.color }}>MTM</span>
        <span>→ Heat →</span>
        <span style={{ color: TIER_COLORS.ltm.color }}>LTM</span>
      </div>
    </div>
  );
}

function PressureView() {
  const pressure = useMemoryStore((s) => s.pressure);
  const agents = useSwarmStore((s) => s.agents);

  // Build pressure data — use real pressure data if available, or estimate from context messages
  const pressureData = useMemo(() => {
    const data: { agentId: string; name: string; pct: number; used: number; max: number }[] = [];
    for (const [agentId, agent] of agents) {
      const p = pressure.get(agentId);
      if (p) {
        data.push({ agentId, name: agent.name, pct: p.percentage, used: p.usedTokens, max: p.maxTokens });
      } else {
        // Estimate from context messages
        const totalTokens = agent.contextMessages.reduce(
          (sum, m) => sum + (m.tokenCount ?? Math.ceil(m.content.length / 4)),
          0
        );
        const maxTokens = 200000; // default context window
        const pct = Math.min(100, (totalTokens / maxTokens) * 100);
        data.push({ agentId, name: agent.name, pct, used: totalTokens, max: maxTokens });
      }
    }
    return data.sort((a, b) => b.pct - a.pct);
  }, [agents, pressure]);

  if (pressureData.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs" style={{ color: "#71717A" }}>
        No agents to display
      </div>
    );
  }

  return (
    <div className="p-3 space-y-3 overflow-y-auto h-full">
      {pressureData.map((d) => {
        const color = getPressureColor(d.pct);
        return (
          <div key={d.agentId}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-display font-semibold" style={{ color: "#F5F5F5" }}>
                {d.name}
              </span>
              <div className="flex items-center gap-2">
                <span
                  className="px-1.5 py-0.5 rounded text-[9px] font-display font-bold uppercase"
                  style={{ backgroundColor: `${color}20`, color }}
                >
                  {getPressureLabel(d.pct)}
                </span>
                <span className="text-[10px] font-display" style={{ color: "#71717A" }}>
                  {d.pct.toFixed(1)}%
                </span>
              </div>
            </div>
            {/* Pressure bar */}
            <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "#222225" }}>
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${d.pct}%`,
                  backgroundColor: color,
                  boxShadow: d.pct > 85 ? `0 0 8px ${color}80` : undefined,
                }}
              />
            </div>
            <div className="flex justify-between mt-0.5">
              <span className="text-[9px] font-display" style={{ color: "#71717A" }}>
                {(d.used / 1000).toFixed(1)}K tokens used
              </span>
              <span className="text-[9px] font-display" style={{ color: "#71717A" }}>
                {(d.max / 1000).toFixed(0)}K max
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function SharedMemoryView() {
  const sharedKeys = useMemoryStore((s) => s.sharedKeys);
  const agents = useSwarmStore((s) => s.agents);

  const getAgentName = (id: string) => agents.get(id)?.name ?? id;

  if (sharedKeys.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs" style={{ color: "#71717A" }}>
        No shared memory keys
      </div>
    );
  }

  return (
    <div className="p-3 space-y-2 overflow-y-auto h-full">
      {sharedKeys.map((sk) => (
        <div
          key={sk.key}
          className="rounded-lg p-2.5"
          style={{
            backgroundColor: "#1A1A1D",
            border: sk.stale ? "1px solid #EF444440" : "1px solid #222225",
          }}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-display font-semibold" style={{ color: "#F5F5F5" }}>
              {sk.key}
            </span>
            {sk.stale && (
              <span
                className="px-1.5 py-0.5 rounded text-[9px] font-display font-bold uppercase"
                style={{ backgroundColor: "#EF444420", color: "#EF4444" }}
              >
                Stale
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {/* Owner */}
            <span
              className="px-1.5 py-0.5 rounded text-[9px] font-display font-semibold"
              style={{ backgroundColor: "#3B82F620", color: "#3B82F6" }}
            >
              {getAgentName(sk.ownerAgentId)}
            </span>
            {/* Arrow */}
            <span className="text-[10px]" style={{ color: "#71717A" }}>→</span>
            {/* Readers */}
            {sk.readerAgentIds.map((readerId) => (
              <span
                key={readerId}
                className="px-1.5 py-0.5 rounded text-[9px] font-display"
                style={{
                  backgroundColor: sk.stale ? "#EF444410" : "#10B98110",
                  color: sk.stale ? "#EF4444" : "#10B981",
                }}
              >
                {getAgentName(readerId)}
              </span>
            ))}
          </div>
          <div className="mt-1 text-[9px] font-display" style={{ color: "#71717A" }}>
            Updated {new Date(sk.lastUpdated).toLocaleTimeString()}
          </div>
        </div>
      ))}
    </div>
  );
}

function MigrationLog() {
  const migrations = useMemoryStore((s) => s.migrations);
  const conflicts = useMemoryStore((s) => s.conflicts);
  const agents = useSwarmStore((s) => s.agents);
  const getAgentName = (id: string) => agents.get(id)?.name ?? id;

  const combined = useMemo(() => {
    const items: { type: "migration" | "conflict"; timestamp: string; data: unknown }[] = [
      ...migrations.map((m) => ({ type: "migration" as const, timestamp: m.timestamp, data: m })),
      ...conflicts.map((c) => ({ type: "conflict" as const, timestamp: c.timestamp, data: c })),
    ];
    return items.sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 50);
  }, [migrations, conflicts]);

  if (combined.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-xs" style={{ color: "#71717A" }}>
        No memory events yet
      </div>
    );
  }

  return (
    <div className="p-3 space-y-1.5 overflow-y-auto h-full">
      {combined.map((item, i) => {
        if (item.type === "migration") {
          const m = item.data as { key: string; fromTier: MemoryTier; toTier: MemoryTier; agentId: string; reason: string };
          return (
            <div key={i} className="flex items-center gap-2 py-1 text-[10px]">
              <span className="font-display" style={{ color: TIER_COLORS[m.fromTier].color }}>
                {TIER_COLORS[m.fromTier].label}
              </span>
              <span style={{ color: "#71717A" }}>→</span>
              <span className="font-display" style={{ color: TIER_COLORS[m.toTier].color }}>
                {TIER_COLORS[m.toTier].label}
              </span>
              <span className="font-display truncate" style={{ color: "#F5F5F5" }}>{m.key}</span>
              <span className="ml-auto shrink-0 font-display" style={{ color: "#71717A" }}>
                {getAgentName(m.agentId)}
              </span>
            </div>
          );
        }
        // Conflict
        const c = item.data as { key: string; agentIds: string[]; values: string[] };
        return (
          <div
            key={i}
            className="flex items-center gap-2 py-1 px-1.5 rounded text-[10px]"
            style={{ backgroundColor: "#EF444410" }}
          >
            <span
              className="px-1 rounded text-[8px] font-display font-bold uppercase"
              style={{ backgroundColor: "#EF444420", color: "#EF4444" }}
            >
              Conflict
            </span>
            <span className="font-display truncate" style={{ color: "#F5F5F5" }}>{c.key}</span>
            <span className="ml-auto shrink-0" style={{ color: "#71717A" }}>
              {c.agentIds.map(getAgentName).join(" vs ")}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Main Component ──────────────────────────────────

export function MemoryDebugger() {
  const [tab, setTab] = useState<MemoryTab>("tiers");
  const selectedAgentId = useSwarmStore((s) => s.selectedAgentId);
  const agents = useSwarmStore((s) => s.agents);

  // Use selected agent or first agent
  const agentId = selectedAgentId ?? (agents.size > 0 ? agents.keys().next().value : null);

  const tabs: { id: MemoryTab; label: string }[] = [
    { id: "tiers", label: "3-Tier" },
    { id: "pressure", label: "Pressure" },
    { id: "shared", label: "Shared" },
    { id: "migrations", label: "Events" },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Sub-tab bar */}
      <div className="flex items-center shrink-0 border-b" style={{ borderColor: "#222225" }}>
        <div className="flex">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-3 py-1.5 text-[10px] font-display font-medium uppercase tracking-wider transition-colors"
              style={{
                color: tab === t.id ? "#8B5CF6" : "#71717A",
                borderBottom: tab === t.id ? "2px solid #8B5CF6" : "2px solid transparent",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        {agentId && (
          <span className="ml-auto pr-3 text-[10px] font-display" style={{ color: "#71717A" }}>
            {agents.get(agentId)?.name ?? agentId}
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {tab === "tiers" && agentId ? (
          <TierVisualization agentId={agentId} />
        ) : tab === "tiers" ? (
          <div className="h-full flex items-center justify-center text-xs" style={{ color: "#71717A" }}>
            Select an agent to view memory tiers
          </div>
        ) : tab === "pressure" ? (
          <PressureView />
        ) : tab === "shared" ? (
          <SharedMemoryView />
        ) : (
          <MigrationLog />
        )}
      </div>
    </div>
  );
}
