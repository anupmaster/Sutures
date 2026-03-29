"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowRightLeft,
  Brain,
  DollarSign,
  Hand,
  Play,
  Pause as PauseIcon,
} from "lucide-react";
import { useEventStore } from "@/stores/eventStore";
import { CATEGORY_LABELS } from "@/lib/constants";
import type { EventCategory } from "@/lib/types";

const CATEGORY_ICONS: Record<EventCategory, React.ReactNode> = {
  lifecycle: <Play size={12} />,
  reasoning: <Brain size={12} />,
  collaboration: <ArrowRightLeft size={12} />,
  memory: <Brain size={12} />,
  intervention: <PauseIcon size={12} />,
  cost: <DollarSign size={12} />,
};

const CATEGORY_COLORS: Record<EventCategory, string> = {
  lifecycle: "#6B7280",
  reasoning: "#3B82F6",
  collaboration: "#8B5CF6",
  memory: "#10B981",
  intervention: "#EF4444",
  cost: "#F59E0B",
};

export function EventLog() {
  const events = useEventStore((s) => s.events);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [hovering, setHovering] = useState(false);

  useEffect(() => {
    if (autoScroll && !hovering && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events.length, autoScroll, hovering]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const atBottom = scrollHeight - scrollTop - clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  // Show last 200 events for perf
  const visibleEvents = events.slice(-200);

  return (
    <div className="h-full flex flex-col overflow-hidden font-body text-xs">
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 border-b shrink-0"
        style={{ borderColor: "#222225" }}
      >
        <span
          className="font-display text-[11px] font-medium uppercase tracking-wider"
          style={{ color: "#71717A" }}
        >
          Events ({events.length})
        </span>
        <div className="flex items-center gap-1.5">
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor: autoScroll ? "#10B981" : "#6B7280",
            }}
          />
          <span
            className="text-[10px] font-display"
            style={{ color: "#71717A" }}
          >
            {autoScroll ? "Live" : "Paused"}
          </span>
        </div>
      </div>

      {/* Event stream */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        onScroll={handleScroll}
        onMouseEnter={() => setHovering(true)}
        onMouseLeave={() => setHovering(false)}
      >
        {visibleEvents.length === 0 ? (
          <div
            className="flex items-center justify-center h-full"
            style={{ color: "#71717A" }}
          >
            Waiting for events...
          </div>
        ) : (
          visibleEvents.map((event) => {
            const catColor = CATEGORY_COLORS[event.category] ?? "#6B7280";
            return (
              <div
                key={event.id}
                className="flex items-center gap-2 px-3 py-1.5 border-b hover:bg-[#1A1A1D] transition-colors"
                style={{ borderColor: "#1A1A1D" }}
              >
                <span style={{ color: catColor }}>
                  {CATEGORY_ICONS[event.category] ?? (
                    <AlertCircle size={12} />
                  )}
                </span>
                <span
                  className="font-display text-[11px] shrink-0"
                  style={{ color: "#71717A", width: 70 }}
                >
                  {new Date(event.timestamp).toLocaleTimeString(undefined, {
                    hour12: false,
                    hour: "2-digit",
                    minute: "2-digit",
                    second: "2-digit",
                  })}
                </span>
                <span
                  className="font-display font-medium shrink-0"
                  style={{ color: "#F5F5F5", width: 100 }}
                >
                  {event.agentName}
                </span>
                <span
                  className="px-1.5 py-0.5 rounded text-[10px] font-display shrink-0"
                  style={{
                    backgroundColor: `${catColor}15`,
                    color: catColor,
                  }}
                >
                  {event.type}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
