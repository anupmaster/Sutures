"use client";

import React, { useMemo, useRef, useEffect, useCallback, useState } from "react";
import { GitFork, Bookmark, ChevronDown } from "lucide-react";
import { useEventStore } from "@/stores/eventStore";
import { useSwarmStore } from "@/stores/swarmStore";
import { STATE_COLORS } from "@/lib/constants";
import type { AgentEvent, EventCategory } from "@/lib/types";

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
}

function SwimLane({ agentName, agentId, events, minTime, maxTime, totalWidth }: SwimLaneProps) {
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

          // Checkpoint markers are special
          if (isCheckpoint(event)) {
            return (
              <div
                key={event.id}
                className="absolute top-0 bottom-0 flex items-center z-20"
                style={{ left: `${leftPct}%` }}
                title={`Checkpoint: ${event.payload.checkpoint_id ?? ""}`}
              >
                <div className="flex flex-col items-center">
                  <Bookmark size={10} style={{ color: "#8B5CF6" }} />
                  <div
                    className="w-px h-full absolute top-0"
                    style={{ backgroundColor: "#8B5CF640" }}
                  />
                </div>
              </div>
            );
          }

          // Fork/pause markers
          if (isFork(event)) {
            return (
              <div
                key={event.id}
                className="absolute top-0 bottom-0 flex items-center z-20"
                style={{ left: `${leftPct}%` }}
                title={`${event.type}: ${event.agentName}`}
              >
                <div className="flex flex-col items-center">
                  <GitFork size={10} style={{ color: "#EF4444" }} />
                  <div
                    className="w-px h-full absolute top-0"
                    style={{ backgroundColor: "#EF444440" }}
                  />
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

export function TimelinePanel() {
  const events = useEventStore((s) => s.events);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [categoryFilter, setCategoryFilter] = useState<EventCategory | "all">("all");

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
    <div className="h-full flex flex-col overflow-hidden">
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
            />
          );
        })}
      </div>
    </div>
  );
}
