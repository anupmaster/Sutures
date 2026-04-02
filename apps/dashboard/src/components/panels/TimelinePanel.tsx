"use client";

import React, { useMemo, useRef, useEffect, useCallback, useState } from "react";
import { GitFork, Bookmark, ChevronDown, RotateCcw } from "lucide-react";
import { useEventStore } from "@/stores/eventStore";
import { useSwarmStore } from "@/stores/swarmStore";
import { STATE_COLORS } from "@/lib/constants";
import type { AgentEvent, EventCategory, DashboardCommand } from "@/lib/types";

// ── Event type → color mapping ──────────────────────
const EVENT_COLORS: Record<EventCategory, string> = {
  lifecycle: "#6B7280",
  reasoning: "#F59E0B",
  collaboration: "#3B82F6",
  memory: "#8B5CF6",
  intervention: "#EF4444",
  cost: "#10B981",
};

// Event type → short label for the visual blocks
function eventLabel(type: string): string {
  const parts = type.split(".");
  return parts[parts.length - 1] ?? type;
}

// Is this event a checkpoint/fork marker?
function isCheckpoint(event: AgentEvent): boolean {
  return event.type === "checkpoint.created";
}

function isFork(event: AgentEvent): boolean {
  return event.type === "breakpoint.hit" || event.type === "agent.paused";
}

function isBreakpoint(event: AgentEvent): boolean {
  return event.type.startsWith("breakpoint.");
}

interface SwimLaneProps {
  agentName: string;
  agentId: string;
  events: AgentEvent[];
  minTime: number;
  maxTime: number;
  totalWidth: number;
  onFork?: (event: AgentEvent) => void;
}

function SwimLane({ agentName, agentId, events, minTime, maxTime, totalWidth, onFork }: SwimLaneProps) {
  const agent = useSwarmStore((s) => s.agents.get(agentId));
  const stateColor = agent ? STATE_COLORS[agent.state] : "#6B7280";
  const timeRange = maxTime - minTime || 1;

  return (
    <div className="flex border-b" style={{ borderColor: "#222225" }}>
      {/* Lane label */}
      <div
        className="w-[120px] shrink-0 px-3 py-2 flex items-center gap-2 border-r sticky left-0 z-10"
        style={{ backgroundColor: "#1A1A1D", borderColor: "#222225" }}
      >
        <span
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: stateColor }}
        />
        <span
          className="font-display text-[11px] font-semibold truncate"
          style={{ color: "#F5F5F5" }}
        >
          {agentName}
        </span>
      </div>

      {/* Event blocks */}
      <div className="relative flex-1 min-h-[36px] py-1" style={{ width: totalWidth }}>
        {events.map((event) => {
          const t = new Date(event.timestamp).getTime();
          const leftPct = ((t - minTime) / timeRange) * 100;
          const color = EVENT_COLORS[event.category];

          // Checkpoint markers — clickable for fork/replay
          if (isCheckpoint(event)) {
            return (
              <div
                key={event.id}
                className="absolute top-0 bottom-0 flex items-center z-20 group/cp"
                style={{ left: `${leftPct}%` }}
              >
                <div className="flex flex-col items-center relative">
                  <button
                    onClick={() => onFork?.(event)}
                    className="hover:scale-125 transition-transform cursor-pointer"
                    title="Fork from this checkpoint"
                  >
                    <Bookmark size={10} style={{ color: "#8B5CF6" }} />
                  </button>
                  <div
                    className="w-px h-full absolute top-0"
                    style={{ backgroundColor: "#8B5CF640" }}
                  />
                  {/* Fork action tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/cp:flex items-center gap-1 z-30">
                    <div
                      className="rounded px-2 py-1 text-[9px] font-display font-semibold whitespace-nowrap flex items-center gap-1"
                      style={{ backgroundColor: "#8B5CF6", color: "#0A0A0B" }}
                    >
                      <RotateCcw size={8} />
                      Fork
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          // Fork/pause markers — also clickable
          if (isFork(event)) {
            return (
              <div
                key={event.id}
                className="absolute top-0 bottom-0 flex items-center z-20 group/fp"
                style={{ left: `${leftPct}%` }}
              >
                <div className="flex flex-col items-center relative">
                  <button
                    onClick={() => onFork?.(event)}
                    className="hover:scale-125 transition-transform cursor-pointer"
                    title="Fork from this breakpoint"
                  >
                    <GitFork size={10} style={{ color: "#EF4444" }} />
                  </button>
                  <div
                    className="w-px h-full absolute top-0"
                    style={{ backgroundColor: "#EF444440" }}
                  />
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover/fp:flex items-center gap-1 z-30">
                    <div
                      className="rounded px-2 py-1 text-[9px] font-display font-semibold whitespace-nowrap flex items-center gap-1"
                      style={{ backgroundColor: "#EF4444", color: "#0A0A0B" }}
                    >
                      <RotateCcw size={8} />
                      Replay
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          // Regular event blocks
          return (
            <div
              key={event.id}
              className="absolute top-1/2 -translate-y-1/2 group cursor-default"
              style={{ left: `${leftPct}%` }}
            >
              {/* Block */}
              <div
                className="h-5 min-w-[4px] rounded-sm flex items-center px-1 transition-all"
                style={{
                  backgroundColor: `${color}30`,
                  border: `1px solid ${color}50`,
                }}
              >
                {/* Only show label if not too cramped */}
                <span
                  className="text-[8px] font-display font-medium whitespace-nowrap overflow-hidden"
                  style={{ color }}
                >
                  {eventLabel(event.type)}
                </span>
              </div>

              {/* Hover tooltip */}
              <div
                className="absolute bottom-full left-0 mb-1 hidden group-hover:block z-30 pointer-events-none"
              >
                <div
                  className="rounded px-2 py-1.5 text-[10px] font-body whitespace-nowrap shadow-lg"
                  style={{ backgroundColor: "#1A1A1D", border: "1px solid #222225" }}
                >
                  <div className="font-display font-semibold" style={{ color: "#F5F5F5" }}>
                    {event.type}
                  </div>
                  <div style={{ color: "#71717A" }}>
                    {new Date(event.timestamp).toLocaleTimeString(undefined, {
                      hour12: false,
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                      fractionalSecondDigits: 3,
                    })}
                  </div>
                  {typeof event.payload.tool_name === "string" && (
                    <div style={{ color: "#A1A1AA" }}>
                      Tool: {event.payload.tool_name}
                    </div>
                  )}
                  {isBreakpoint(event) && typeof event.payload.breakpoint_id === "string" && (
                    <div style={{ color: "#EF4444" }}>
                      BP: {event.payload.breakpoint_id}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface ForkTarget {
  event: AgentEvent;
  type: "checkpoint" | "breakpoint";
}

interface TimelinePanelProps {
  onSendCommand?: (cmd: DashboardCommand) => void;
}

export function TimelinePanel({ onSendCommand }: TimelinePanelProps) {
  const events = useEventStore((s) => s.events);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<EventCategory | "all">("all");
  const [forkTarget, setForkTarget] = useState<ForkTarget | null>(null);

  const handleFork = useCallback((event: AgentEvent) => {
    setForkTarget({
      event,
      type: isCheckpoint(event) ? "checkpoint" : "breakpoint",
    });
  }, []);

  const executeFork = useCallback(() => {
    if (!forkTarget) return;
    if (forkTarget.type === "checkpoint" && typeof forkTarget.event.payload.checkpoint_id === "string") {
      onSendCommand?.({
        type: "command",
        command: "fork_from_checkpoint",
        payload: { checkpoint_id: forkTarget.event.payload.checkpoint_id },
      });
    }
    setForkTarget(null);
  }, [forkTarget, onSendCommand]);

  // Filter events
  const filteredEvents = useMemo(() => {
    const recent = events.slice(-500);
    if (categoryFilter === "all") return recent;
    return recent.filter((e) => e.category === categoryFilter);
  }, [events, categoryFilter]);

  // Group events by agent
  const grouped = useMemo(() => {
    const map = new Map<string, { agentId: string; events: AgentEvent[] }>();
    for (const event of filteredEvents) {
      const key = event.agentName;
      if (!map.has(key)) {
        map.set(key, { agentId: event.agentId, events: [] });
      }
      map.get(key)!.events.push(event);
    }
    return map;
  }, [filteredEvents]);

  // Time range
  const { minTime, maxTime } = useMemo(() => {
    if (filteredEvents.length === 0) return { minTime: 0, maxTime: 1 };
    const times = filteredEvents.map((e) => new Date(e.timestamp).getTime());
    return { minTime: Math.min(...times), maxTime: Math.max(...times) };
  }, [filteredEvents]);

  // Auto-scroll to latest
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [filteredEvents, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
    // If user scrolled away from right edge, disable auto-scroll
    setAutoScroll(scrollLeft + clientWidth >= scrollWidth - 20);
  }, []);

  const agentNames = useMemo(() => Array.from(grouped.keys()), [grouped]);

  if (agentNames.length === 0) {
    return (
      <div
        className="h-full flex items-center justify-center font-body text-sm"
        style={{ color: "#71717A" }}
      >
        Timeline will populate as events arrive
      </div>
    );
  }

  const totalWidth = Math.max(800, filteredEvents.length * 12);

  const categories: { id: EventCategory | "all"; label: string; color: string }[] = [
    { id: "all", label: "All", color: "#A1A1AA" },
    { id: "lifecycle", label: "Life", color: EVENT_COLORS.lifecycle },
    { id: "reasoning", label: "Think", color: EVENT_COLORS.reasoning },
    { id: "collaboration", label: "Collab", color: EVENT_COLORS.collaboration },
    { id: "memory", label: "Mem", color: EVENT_COLORS.memory },
    { id: "intervention", label: "BP", color: EVENT_COLORS.intervention },
    { id: "cost", label: "Cost", color: EVENT_COLORS.cost },
  ];

  return (
    <div className="h-full flex flex-col overflow-hidden relative">
      {/* Filter bar */}
      <div
        className="flex items-center gap-1 px-3 py-1 border-b shrink-0"
        style={{ borderColor: "#222225" }}
      >
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setCategoryFilter(cat.id)}
            className="px-2 py-0.5 rounded text-[9px] font-display font-semibold uppercase tracking-wider transition-colors"
            style={{
              backgroundColor: categoryFilter === cat.id ? `${cat.color}20` : "transparent",
              color: categoryFilter === cat.id ? cat.color : "#71717A",
            }}
          >
            {cat.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[9px] font-display" style={{ color: "#71717A" }}>
            {filteredEvents.length} events
          </span>
          {!autoScroll && (
            <button
              onClick={() => setAutoScroll(true)}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-display"
              style={{ backgroundColor: "#10B98120", color: "#10B981" }}
            >
              <ChevronDown size={9} />
              Latest
            </button>
          )}
        </div>
      </div>

      {/* Swim lanes */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto"
        onScroll={handleScroll}
      >
        {/* Time ruler */}
        <div className="flex sticky top-0 z-20" style={{ backgroundColor: "#0A0A0B" }}>
          <div
            className="w-[120px] shrink-0 border-r border-b px-3 py-1"
            style={{ borderColor: "#222225", backgroundColor: "#0A0A0B" }}
          >
            <span className="text-[9px] font-display uppercase" style={{ color: "#71717A" }}>
              Agent
            </span>
          </div>
          <div
            className="flex-1 border-b py-1 relative"
            style={{ borderColor: "#222225", width: totalWidth }}
          >
            {/* Time markers */}
            {[0, 0.25, 0.5, 0.75, 1].map((pct) => {
              const t = minTime + (maxTime - minTime) * pct;
              return (
                <span
                  key={pct}
                  className="absolute text-[9px] font-display -translate-x-1/2"
                  style={{ left: `${pct * 100}%`, color: "#71717A" }}
                >
                  {new Date(t).toLocaleTimeString(undefined, {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
              );
            })}
          </div>
        </div>

        {/* Lanes */}
        {agentNames.map((name) => {
          const data = grouped.get(name)!;
          return (
            <SwimLane
              key={name}
              agentName={name}
              agentId={data.agentId}
              events={data.events}
              minTime={minTime}
              maxTime={maxTime}
              totalWidth={totalWidth}
              onFork={handleFork}
            />
          );
        })}
      </div>

      {/* Fork confirmation dialog */}
      {forkTarget && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/50">
          <div
            className="rounded-xl p-4 max-w-sm w-full mx-4 shadow-2xl"
            style={{ backgroundColor: "#1A1A1D", border: "1px solid #222225" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <RotateCcw size={16} style={{ color: "#8B5CF6" }} />
              <span className="font-display text-sm font-semibold" style={{ color: "#F5F5F5" }}>
                Fork from {forkTarget.type}
              </span>
            </div>
            <p className="text-[11px] font-body mb-1" style={{ color: "#A1A1AA" }}>
              Agent: <span style={{ color: "#F5F5F5" }}>{forkTarget.event.agentName}</span>
            </p>
            <p className="text-[11px] font-body mb-1" style={{ color: "#A1A1AA" }}>
              Time: <span style={{ color: "#F5F5F5" }}>
                {new Date(forkTarget.event.timestamp).toLocaleTimeString()}
              </span>
            </p>
            {forkTarget.type === "checkpoint" && typeof forkTarget.event.payload.checkpoint_id === "string" && (
              <p className="text-[10px] font-mono mb-3" style={{ color: "#71717A" }}>
                ID: {forkTarget.event.payload.checkpoint_id}
              </p>
            )}
            <p className="text-[10px] font-body mb-4" style={{ color: "#71717A" }}>
              This will create a new execution branch from this point,
              allowing you to replay with different parameters.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setForkTarget(null)}
                className="flex-1 py-1.5 rounded-lg text-xs font-display font-semibold transition-colors"
                style={{ backgroundColor: "#222225", color: "#A1A1AA" }}
              >
                Cancel
              </button>
              <button
                onClick={executeFork}
                className="flex-1 py-1.5 rounded-lg text-xs font-display font-semibold transition-colors"
                style={{ backgroundColor: "#8B5CF6", color: "#0A0A0B" }}
              >
                Fork & Replay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
