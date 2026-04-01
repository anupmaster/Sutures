"use client";

import React, { useMemo, useState, useCallback } from "react";
import { GitCompare, ArrowRight, Clock, DollarSign, Layers } from "lucide-react";
import { useEventStore } from "@/stores/eventStore";
import type { AgentEvent } from "@/lib/types";

interface RunSummary {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  totalCost: number;
  agentCount: number;
  eventCount: number;
  toolCalls: string[];
  errors: number;
  events: AgentEvent[];
}

interface DiffResult {
  costDiff: number;
  costDiffPct: number;
  durationDiff: number;
  durationDiffPct: number;
  missingInA: string[]; // event types in B but not A
  missingInB: string[]; // event types in A but not B
  toolDiffs: { tool: string; inA: number; inB: number }[];
  divergencePoint: AgentEvent | null;
}

function buildRunFromEvents(events: AgentEvent[], label: string): RunSummary {
  if (events.length === 0) {
    return {
      id: label,
      label,
      startTime: "",
      endTime: "",
      durationMs: 0,
      totalCost: 0,
      agentCount: 0,
      eventCount: 0,
      toolCalls: [],
      errors: 0,
      events,
    };
  }

  const agents = new Set(events.map((e) => e.agentId));
  const toolCalls = events
    .filter((e) => e.type === "turn.acting" && typeof e.payload.tool_name === "string")
    .map((e) => e.payload.tool_name as string);
  const errors = events.filter(
    (e) => e.type.includes("failed") || e.type.includes("error")
  ).length;

  let totalCost = 0;
  for (const e of events) {
    if (e.type === "cost.tokens" && typeof e.payload.cost_usd === "number") {
      totalCost += e.payload.cost_usd as number;
    }
  }

  const startTime = events[0].timestamp;
  const endTime = events[events.length - 1].timestamp;
  const durationMs = new Date(endTime).getTime() - new Date(startTime).getTime();

  return {
    id: label,
    label,
    startTime,
    endTime,
    durationMs,
    totalCost,
    agentCount: agents.size,
    eventCount: events.length,
    toolCalls,
    errors,
    events,
  };
}

function computeDiff(runA: RunSummary, runB: RunSummary): DiffResult {
  const costDiff = runB.totalCost - runA.totalCost;
  const costDiffPct = runA.totalCost > 0 ? (costDiff / runA.totalCost) * 100 : 0;
  const durationDiff = runB.durationMs - runA.durationMs;
  const durationDiffPct = runA.durationMs > 0 ? (durationDiff / runA.durationMs) * 100 : 0;

  const typesA = new Set(runA.events.map((e) => e.type));
  const typesB = new Set(runB.events.map((e) => e.type));
  const missingInA = [...typesB].filter((t) => !typesA.has(t));
  const missingInB = [...typesA].filter((t) => !typesB.has(t));

  // Tool call frequency diff
  const toolCountA = new Map<string, number>();
  const toolCountB = new Map<string, number>();
  for (const t of runA.toolCalls) toolCountA.set(t, (toolCountA.get(t) ?? 0) + 1);
  for (const t of runB.toolCalls) toolCountB.set(t, (toolCountB.get(t) ?? 0) + 1);
  const allTools = new Set([...toolCountA.keys(), ...toolCountB.keys()]);
  const toolDiffs = [...allTools]
    .map((tool) => ({
      tool,
      inA: toolCountA.get(tool) ?? 0,
      inB: toolCountB.get(tool) ?? 0,
    }))
    .filter((d) => d.inA !== d.inB);

  // Find divergence point: first event where sequences differ
  let divergencePoint: AgentEvent | null = null;
  const minLen = Math.min(runA.events.length, runB.events.length);
  for (let i = 0; i < minLen; i++) {
    if (runA.events[i].type !== runB.events[i].type) {
      divergencePoint = runA.events[i];
      break;
    }
  }

  return { costDiff, costDiffPct, durationDiff, durationDiffPct, missingInA, missingInB, toolDiffs, divergencePoint };
}

function DiffBadge({ value, unit, inverse }: { value: number; unit: string; inverse?: boolean }) {
  const isPositive = inverse ? value < 0 : value > 0;
  const isNegative = inverse ? value > 0 : value < 0;
  const color = isPositive ? "#10B981" : isNegative ? "#EF4444" : "#71717A";
  const sign = value > 0 ? "+" : "";
  return (
    <span
      className="px-1.5 py-0.5 rounded text-[9px] font-display font-bold"
      style={{ backgroundColor: `${color}20`, color }}
    >
      {sign}{value.toFixed(value < 10 ? 2 : 0)}{unit}
    </span>
  );
}

export function ComparatorPanel() {
  const events = useEventStore((s) => s.events);
  const [splitPoint, setSplitPoint] = useState(50); // percentage to split events

  // Split events into two "runs" — in a real implementation these would be
  // separate trace sessions. For now, split the current session by midpoint.
  const { runA, runB, diff } = useMemo(() => {
    if (events.length < 4) {
      return { runA: null, runB: null, diff: null };
    }
    const mid = Math.floor(events.length * (splitPoint / 100));
    const eventsA = events.slice(0, mid);
    const eventsB = events.slice(mid);
    const runA = buildRunFromEvents(eventsA, "Run A (first half)");
    const runB = buildRunFromEvents(eventsB, "Run B (second half)");
    const diff = computeDiff(runA, runB);
    return { runA, runB, diff };
  }, [events, splitPoint]);

  if (!runA || !runB || !diff) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "#3B82F620" }}
        >
          <GitCompare size={18} style={{ color: "#3B82F6" }} />
        </div>
        <div>
          <p className="text-xs font-display font-semibold" style={{ color: "#F5F5F5" }}>
            Golden Run Comparator
          </p>
          <p className="text-[10px] font-body mt-1" style={{ color: "#71717A" }}>
            Run a simulation or connect agents to compare trace segments.
            Needs at least 4 events to split into two runs.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Split control */}
      <div
        className="flex items-center gap-3 px-3 py-2 border-b shrink-0"
        style={{ borderColor: "#222225" }}
      >
        <GitCompare size={13} style={{ color: "#3B82F6" }} />
        <span className="text-[10px] font-display font-medium" style={{ color: "#71717A" }}>
          Split at
        </span>
        <input
          type="range"
          min={10}
          max={90}
          value={splitPoint}
          onChange={(e) => setSplitPoint(parseInt(e.target.value))}
          className="flex-1 h-1 accent-[#3B82F6]"
        />
        <span className="text-[10px] font-display" style={{ color: "#A1A1AA" }}>
          {splitPoint}%
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Side-by-side summary */}
        <div className="grid grid-cols-2 gap-2">
          {[runA, runB].map((run, i) => (
            <div
              key={i}
              className="rounded-lg p-2.5"
              style={{
                backgroundColor: "#1A1A1D",
                border: `1px solid ${i === 0 ? "#3B82F630" : "#10B98130"}`,
              }}
            >
              <div className="text-[10px] font-display font-bold mb-2" style={{ color: i === 0 ? "#3B82F6" : "#10B981" }}>
                {run.label}
              </div>
              <div className="grid grid-cols-2 gap-y-1.5 text-[10px]">
                <div className="flex items-center gap-1">
                  <Layers size={9} style={{ color: "#71717A" }} />
                  <span style={{ color: "#71717A" }}>Events:</span>
                  <span className="font-display font-semibold" style={{ color: "#F5F5F5" }}>{run.eventCount}</span>
                </div>
                <div className="flex items-center gap-1">
                  <DollarSign size={9} style={{ color: "#71717A" }} />
                  <span style={{ color: "#71717A" }}>Cost:</span>
                  <span className="font-display font-semibold" style={{ color: "#F5F5F5" }}>${run.totalCost.toFixed(4)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <Clock size={9} style={{ color: "#71717A" }} />
                  <span style={{ color: "#71717A" }}>Duration:</span>
                  <span className="font-display font-semibold" style={{ color: "#F5F5F5" }}>{(run.durationMs / 1000).toFixed(1)}s</span>
                </div>
                <div>
                  <span style={{ color: "#71717A" }}>Agents:</span>
                  <span className="font-display font-semibold ml-1" style={{ color: "#F5F5F5" }}>{run.agentCount}</span>
                </div>
              </div>
              {run.errors > 0 && (
                <div className="mt-1.5 text-[9px] font-display font-bold" style={{ color: "#EF4444" }}>
                  {run.errors} error{run.errors !== 1 ? "s" : ""}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Diff summary */}
        <div
          className="rounded-lg p-2.5"
          style={{ backgroundColor: "#1A1A1D", border: "1px solid #222225" }}
        >
          <div className="text-[10px] font-display font-bold mb-2" style={{ color: "#F5F5F5" }}>
            Diff Summary
          </div>
          <div className="flex flex-wrap gap-3 text-[10px]">
            <div className="flex items-center gap-1.5">
              <span style={{ color: "#71717A" }}>Cost:</span>
              <DiffBadge value={diff.costDiffPct} unit="%" inverse />
            </div>
            <div className="flex items-center gap-1.5">
              <span style={{ color: "#71717A" }}>Duration:</span>
              <DiffBadge value={diff.durationDiffPct} unit="%" inverse />
            </div>
          </div>
        </div>

        {/* Tool call diffs */}
        {diff.toolDiffs.length > 0 && (
          <div
            className="rounded-lg p-2.5"
            style={{ backgroundColor: "#1A1A1D", border: "1px solid #222225" }}
          >
            <div className="text-[10px] font-display font-bold mb-2" style={{ color: "#F5F5F5" }}>
              Tool Call Differences
            </div>
            <div className="space-y-1">
              {diff.toolDiffs.map((td) => (
                <div key={td.tool} className="flex items-center gap-2 text-[10px]">
                  <span className="font-display font-semibold truncate flex-1" style={{ color: "#A1A1AA" }}>
                    {td.tool}
                  </span>
                  <span style={{ color: "#3B82F6" }}>{td.inA}x</span>
                  <ArrowRight size={8} style={{ color: "#71717A" }} />
                  <span style={{ color: "#10B981" }}>{td.inB}x</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Missing event types */}
        {(diff.missingInA.length > 0 || diff.missingInB.length > 0) && (
          <div
            className="rounded-lg p-2.5"
            style={{ backgroundColor: "#1A1A1D", border: "1px solid #222225" }}
          >
            <div className="text-[10px] font-display font-bold mb-2" style={{ color: "#F5F5F5" }}>
              Event Type Differences
            </div>
            {diff.missingInB.length > 0 && (
              <div className="mb-1.5">
                <span className="text-[9px] font-display" style={{ color: "#3B82F6" }}>Only in Run A: </span>
                <span className="text-[9px] font-body" style={{ color: "#A1A1AA" }}>
                  {diff.missingInB.join(", ")}
                </span>
              </div>
            )}
            {diff.missingInA.length > 0 && (
              <div>
                <span className="text-[9px] font-display" style={{ color: "#10B981" }}>Only in Run B: </span>
                <span className="text-[9px] font-body" style={{ color: "#A1A1AA" }}>
                  {diff.missingInA.join(", ")}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Divergence point */}
        {diff.divergencePoint && (
          <div
            className="rounded-lg p-2.5"
            style={{ backgroundColor: "#F59E0B10", border: "1px solid #F59E0B30" }}
          >
            <div className="text-[10px] font-display font-bold mb-1" style={{ color: "#F59E0B" }}>
              First Divergence
            </div>
            <p className="text-[10px] font-body" style={{ color: "#A1A1AA" }}>
              Runs diverge at <span style={{ color: "#F5F5F5" }}>{diff.divergencePoint.type}</span> by{" "}
              <span style={{ color: "#F5F5F5" }}>{diff.divergencePoint.agentName}</span> at{" "}
              {new Date(diff.divergencePoint.timestamp).toLocaleTimeString()}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
