"use client";

import React, { useCallback, useState } from "react";
import { Plus, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { useBreakpointStore } from "@/stores/breakpointStore";
import { useSwarmStore } from "@/stores/swarmStore";
import { BREAKPOINT_LABELS } from "@/lib/constants";
import type { BreakpointCondition } from "@/lib/types";

const CONDITIONS: BreakpointCondition[] = [
  "on_turn",
  "on_tool",
  "on_cost",
  "on_error",
  "on_handoff",
  "always",
];

export function BreakpointPanel() {
  const breakpoints = useBreakpointStore((s) => s.breakpoints);
  const hits = useBreakpointStore((s) => s.hits);
  const addBreakpoint = useBreakpointStore((s) => s.addBreakpoint);
  const removeBreakpoint = useBreakpointStore((s) => s.removeBreakpoint);
  const toggleBreakpoint = useBreakpointStore((s) => s.toggleBreakpoint);
  const agents = useSwarmStore((s) => s.agents);

  const [showForm, setShowForm] = useState(false);
  const [formAgent, setFormAgent] = useState("");
  const [formCondition, setFormCondition] =
    useState<BreakpointCondition>("on_turn");
  const [formThreshold, setFormThreshold] = useState("");

  const agentList = Array.from(agents.values());

  const handleAdd = useCallback(() => {
    const bp = {
      id: crypto.randomUUID(),
      agentId: formAgent || undefined,
      condition: formCondition,
      params:
        formCondition === "on_cost" && formThreshold
          ? { threshold: parseFloat(formThreshold) }
          : undefined,
      enabled: true,
      hitCount: 0,
      createdAt: new Date().toISOString(),
    };
    addBreakpoint(bp);
    setShowForm(false);
    setFormAgent("");
    setFormCondition("on_turn");
    setFormThreshold("");
  }, [formAgent, formCondition, formThreshold, addBreakpoint]);

  return (
    <div className="h-full flex flex-col overflow-hidden font-body text-xs">
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b shrink-0"
        style={{ borderColor: "#222225" }}
      >
        <span
          className="font-display text-[11px] font-medium uppercase tracking-wider"
          style={{ color: "#71717A" }}
        >
          Breakpoints ({breakpoints.length})
        </span>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-display font-medium transition-colors"
          style={{
            backgroundColor: showForm ? "#222225" : "#10B98120",
            color: showForm ? "#A1A1AA" : "#10B981",
          }}
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div
          className="p-3 border-b space-y-2 shrink-0"
          style={{ borderColor: "#222225", backgroundColor: "#1A1A1D" }}
        >
          <div className="flex gap-2">
            <select
              value={formAgent}
              onChange={(e) => setFormAgent(e.target.value)}
              className="flex-1 rounded px-2 py-1.5 text-xs font-body outline-none"
              style={{
                backgroundColor: "#222225",
                color: "#F5F5F5",
                border: "1px solid #333336",
              }}
            >
              <option value="">All agents</option>
              {agentList.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              value={formCondition}
              onChange={(e) =>
                setFormCondition(e.target.value as BreakpointCondition)
              }
              className="flex-1 rounded px-2 py-1.5 text-xs font-body outline-none"
              style={{
                backgroundColor: "#222225",
                color: "#F5F5F5",
                border: "1px solid #333336",
              }}
            >
              {CONDITIONS.map((c) => (
                <option key={c} value={c}>
                  {BREAKPOINT_LABELS[c]}
                </option>
              ))}
            </select>
          </div>
          {formCondition === "on_cost" && (
            <input
              type="number"
              step="0.01"
              placeholder="Cost threshold ($)"
              value={formThreshold}
              onChange={(e) => setFormThreshold(e.target.value)}
              className="w-full rounded px-2 py-1.5 text-xs font-body outline-none"
              style={{
                backgroundColor: "#222225",
                color: "#F5F5F5",
                border: "1px solid #333336",
              }}
            />
          )}
          <button
            onClick={handleAdd}
            className="w-full rounded py-1.5 text-xs font-display font-semibold transition-colors"
            style={{
              backgroundColor: "#10B981",
              color: "#0A0A0B",
            }}
          >
            Create Breakpoint
          </button>
        </div>
      )}

      {/* Breakpoint list */}
      <div className="flex-1 overflow-y-auto">
        {breakpoints.length === 0 ? (
          <div
            className="flex items-center justify-center h-full"
            style={{ color: "#71717A" }}
          >
            No breakpoints set
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: "#222225" }}>
            {breakpoints.map((bp) => {
              const agentName = bp.agentId
                ? agents.get(bp.agentId)?.name ?? "Unknown"
                : "All";
              return (
                <div
                  key={bp.id}
                  className="flex items-center justify-between px-3 py-2 hover:bg-[#1A1A1D] transition-colors"
                  style={{
                    opacity: bp.enabled ? 1 : 0.5,
                    borderColor: "#222225",
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: bp.enabled ? "#EF4444" : "#6B7280",
                      }}
                    />
                    <div className="min-w-0">
                      <div style={{ color: "#F5F5F5" }}>
                        <span className="font-display font-medium">
                          {BREAKPOINT_LABELS[bp.condition]}
                        </span>
                        <span
                          className="ml-1.5"
                          style={{ color: "#71717A" }}
                        >
                          {agentName}
                        </span>
                      </div>
                      {bp.hitCount > 0 && (
                        <span
                          className="text-[10px] font-display"
                          style={{ color: "#F59E0B" }}
                        >
                          {bp.hitCount} hit{bp.hitCount !== 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => toggleBreakpoint(bp.id)}
                      className="p-1 rounded hover:bg-[#222225] transition-colors"
                    >
                      {bp.enabled ? (
                        <ToggleRight size={16} style={{ color: "#10B981" }} />
                      ) : (
                        <ToggleLeft size={16} style={{ color: "#6B7280" }} />
                      )}
                    </button>
                    <button
                      onClick={() => removeBreakpoint(bp.id)}
                      className="p-1 rounded hover:bg-[#222225] transition-colors"
                    >
                      <Trash2 size={14} style={{ color: "#71717A" }} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Hit history */}
      {hits.length > 0 && (
        <div
          className="border-t shrink-0 max-h-[120px] overflow-y-auto"
          style={{ borderColor: "#222225" }}
        >
          <div
            className="px-3 py-1.5 font-display text-[10px] font-medium uppercase tracking-wider sticky top-0"
            style={{ color: "#71717A", backgroundColor: "#111113" }}
          >
            Hit History
          </div>
          {hits
            .slice(-20)
            .reverse()
            .map((hit, i) => (
              <div
                key={i}
                className="px-3 py-1 flex items-center gap-2"
                style={{ color: "#A1A1AA" }}
              >
                <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] shrink-0" />
                <span className="font-display" style={{ color: "#F5F5F5" }}>
                  {hit.agentName}
                </span>
                <span style={{ color: "#71717A" }}>
                  {new Date(hit.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
