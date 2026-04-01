"use client";

import React from "react";
import { AlertTriangle, X, RefreshCw, DollarSign, MemoryStick, Repeat } from "lucide-react";
import { useAnomalyStore } from "@/stores/anomalyStore";

const ANOMALY_ICONS: Record<string, React.ReactNode> = {
  infinite_loop: <RefreshCw size={12} />,
  cost_spike: <DollarSign size={12} />,
  context_bloat: <MemoryStick size={12} />,
  handoff_cycle: <Repeat size={12} />,
};

const ANOMALY_COLORS: Record<string, string> = {
  infinite_loop: "#EF4444",
  cost_spike: "#F59E0B",
  context_bloat: "#8B5CF6",
  handoff_cycle: "#3B82F6",
};

export function AnomalyBanner() {
  const alerts = useAnomalyStore((s) => s.alerts);
  const dismissAlert = useAnomalyStore((s) => s.dismissAlert);
  const dismissAll = useAnomalyStore((s) => s.dismissAll);

  const active = alerts.filter((a) => !a.dismissed);
  if (active.length === 0) return null;

  return (
    <div className="shrink-0 border-b" style={{ borderColor: "#222225" }}>
      {active.slice(-3).map((alert, i) => {
        const realIndex = alerts.indexOf(alert);
        const color = ANOMALY_COLORS[alert.type] ?? "#EF4444";
        return (
          <div
            key={realIndex}
            className="flex items-center gap-2 px-4 py-1.5 text-[11px]"
            style={{
              backgroundColor: `${color}10`,
              borderBottom: i < active.length - 1 ? "1px solid #222225" : undefined,
            }}
          >
            <span style={{ color }}>{ANOMALY_ICONS[alert.type] ?? <AlertTriangle size={12} />}</span>
            <span className="font-display font-semibold" style={{ color }}>
              {alert.type.replace(/_/g, " ").toUpperCase()}
            </span>
            <span className="font-body truncate flex-1" style={{ color: "#A1A1AA" }}>
              {alert.message}
            </span>
            <span className="font-display text-[9px] shrink-0" style={{ color: "#71717A" }}>
              {new Date(alert.detectedAt).toLocaleTimeString()}
            </span>
            <button
              onClick={() => dismissAlert(realIndex)}
              className="p-0.5 rounded hover:bg-[#222225] transition-colors shrink-0"
            >
              <X size={11} style={{ color: "#71717A" }} />
            </button>
          </div>
        );
      })}
      {active.length > 3 && (
        <div
          className="flex items-center justify-between px-4 py-1 text-[10px]"
          style={{ backgroundColor: "#1A1A1D" }}
        >
          <span style={{ color: "#71717A" }}>
            +{active.length - 3} more alert{active.length - 3 !== 1 ? "s" : ""}
          </span>
          <button
            onClick={dismissAll}
            className="font-display font-semibold hover:underline"
            style={{ color: "#71717A" }}
          >
            Dismiss all
          </button>
        </div>
      )}
    </div>
  );
}
