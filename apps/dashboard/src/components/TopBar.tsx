"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  Play,
  Pause,
  Square,
  Settings,
  ChevronDown,
  Wifi,
  WifiOff,
} from "lucide-react";
import { useSwarmStore } from "@/stores/swarmStore";
import type { ConnectionStatus, DashboardCommand } from "@/lib/types";

interface TopBarProps {
  connectionStatus: ConnectionStatus;
  onSendCommand: (command: DashboardCommand) => void;
}

const CONNECTION_COLORS: Record<ConnectionStatus, string> = {
  connected: "#10B981",
  connecting: "#F59E0B",
  disconnected: "#EF4444",
};

const CONNECTION_LABELS: Record<ConnectionStatus, string> = {
  connected: "Connected",
  connecting: "Connecting...",
  disconnected: "Disconnected",
};

export function TopBar({ connectionStatus, onSendCommand }: TopBarProps) {
  const swarms = useSwarmStore((s) => s.swarms);
  const currentSwarmId = useSwarmStore((s) => s.currentSwarmId);
  const setCurrentSwarm = useSwarmStore((s) => s.setCurrentSwarm);
  const totalCost = useSwarmStore((s) => s.totalCost);
  const runStartedAt = useSwarmStore((s) => s.runStartedAt);
  const [elapsed, setElapsed] = useState("00:00");

  // Run duration timer
  useEffect(() => {
    if (!runStartedAt) {
      setElapsed("00:00");
      return;
    }

    const update = () => {
      const diff = Date.now() - new Date(runStartedAt).getTime();
      const mins = Math.floor(diff / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      setElapsed(
        `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
      );
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [runStartedAt]);

  const connColor = CONNECTION_COLORS[connectionStatus];

  return (
    <div
      className="h-11 flex items-center justify-between px-4 border-b shrink-0"
      style={{
        backgroundColor: "#0A0A0B",
        borderColor: "#222225",
      }}
    >
      {/* Left section */}
      <div className="flex items-center gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2">
          <div
            className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-display font-bold"
            style={{ backgroundColor: "#10B981", color: "#0A0A0B" }}
          >
            S
          </div>
          <span
            className="font-display text-sm font-bold tracking-tight"
            style={{ color: "#F5F5F5" }}
          >
            Sutures
          </span>
        </div>

        {/* Separator */}
        <div className="w-px h-5" style={{ backgroundColor: "#222225" }} />

        {/* Swarm selector */}
        <div className="relative">
          <select
            value={currentSwarmId ?? ""}
            onChange={(e) => setCurrentSwarm(e.target.value)}
            className="appearance-none rounded px-3 py-1 pr-7 text-xs font-display font-medium outline-none cursor-pointer"
            style={{
              backgroundColor: "#1A1A1D",
              color: "#F5F5F5",
              border: "1px solid #222225",
            }}
          >
            {swarms.length === 0 ? (
              <option value="">No swarms</option>
            ) : (
              swarms.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))
            )}
          </select>
          <ChevronDown
            size={12}
            className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none"
            style={{ color: "#71717A" }}
          />
        </div>

        {/* Run controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() =>
              onSendCommand({
                type: "command",
                command: "resume_all",
                payload: {},
              })
            }
            className="p-1.5 rounded hover:bg-[#1A1A1D] transition-colors"
            title="Resume All"
          >
            <Play size={14} style={{ color: "#10B981" }} />
          </button>
          <button
            onClick={() =>
              onSendCommand({
                type: "command",
                command: "pause_all",
                payload: {},
              })
            }
            className="p-1.5 rounded hover:bg-[#1A1A1D] transition-colors"
            title="Pause All"
          >
            <Pause size={14} style={{ color: "#F59E0B" }} />
          </button>
          <button
            className="p-1.5 rounded hover:bg-[#1A1A1D] transition-colors"
            title="Stop"
          >
            <Square size={14} style={{ color: "#EF4444" }} />
          </button>
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-4">
        {/* Duration */}
        <span
          className="font-display text-xs"
          style={{ color: "#71717A" }}
        >
          {elapsed}
        </span>

        {/* Cost */}
        <div
          className="font-display text-xs font-semibold px-2 py-0.5 rounded"
          style={{
            backgroundColor: "#10B98115",
            color: "#10B981",
          }}
        >
          ${totalCost.toFixed(4)}
        </div>

        {/* Connection status */}
        <div className="flex items-center gap-1.5">
          <span
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: connColor,
              boxShadow:
                connectionStatus === "connected"
                  ? `0 0 6px ${connColor}`
                  : undefined,
            }}
          />
          {connectionStatus === "connected" ? (
            <Wifi size={14} style={{ color: connColor }} />
          ) : (
            <WifiOff size={14} style={{ color: connColor }} />
          )}
          <span
            className="text-[10px] font-display"
            style={{ color: connColor }}
          >
            {CONNECTION_LABELS[connectionStatus]}
          </span>
        </div>

        {/* Settings */}
        <button className="p-1.5 rounded hover:bg-[#1A1A1D] transition-colors">
          <Settings size={14} style={{ color: "#71717A" }} />
        </button>
      </div>
    </div>
  );
}
