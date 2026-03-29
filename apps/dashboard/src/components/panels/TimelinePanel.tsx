"use client";

import React, { useMemo } from "react";
import { useEventStore } from "@/stores/eventStore";
import { STATE_COLORS } from "@/lib/constants";

export function TimelinePanel() {
  const events = useEventStore((s) => s.events);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof events>();
    for (const event of events.slice(-300)) {
      const key = event.agentName;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(event);
    }
    return map;
  }, [events]);

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

  return (
    <div className="h-full overflow-y-auto font-body text-xs">
      {agentNames.map((name) => {
        const agentEvents = grouped.get(name) ?? [];
        return (
          <div key={name} className="border-b" style={{ borderColor: "#222225" }}>
            {/* Swim lane header */}
            <div
              className="sticky top-0 px-3 py-1.5 flex items-center gap-2"
              style={{ backgroundColor: "#1A1A1D" }}
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: STATE_COLORS.acting }}
              />
              <span
                className="font-display text-[11px] font-semibold"
                style={{ color: "#F5F5F5" }}
              >
                {name}
              </span>
              <span
                className="font-display text-[10px]"
                style={{ color: "#71717A" }}
              >
                ({agentEvents.length})
              </span>
            </div>

            {/* Events */}
            <div className="px-3 py-1">
              {agentEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex items-center gap-2 py-0.5"
                >
                  <span
                    className="font-display text-[10px] shrink-0"
                    style={{ color: "#71717A", width: 65 }}
                  >
                    {new Date(event.timestamp).toLocaleTimeString(undefined, {
                      hour12: false,
                      hour: "2-digit",
                      minute: "2-digit",
                      second: "2-digit",
                    })}
                  </span>
                  <span
                    className="w-1 h-1 rounded-full shrink-0"
                    style={{ backgroundColor: "#71717A" }}
                  />
                  <span style={{ color: "#A1A1AA" }}>{event.type}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
