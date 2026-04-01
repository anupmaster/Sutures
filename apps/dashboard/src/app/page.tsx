"use client";

import React, { useCallback, useState } from "react";
import {
  Brain,
  Bug,
  Clock,
  Crosshair,
  DollarSign,
  GitCompare,
  List,
  Syringe,
} from "lucide-react";
import { TopBar } from "@/components/TopBar";
import { TopologyCanvas } from "@/components/topology/TopologyCanvas";
import { AgentInspector } from "@/components/inspector/AgentInspector";
import { TimelinePanel } from "@/components/panels/TimelinePanel";
import { BreakpointPanel } from "@/components/panels/BreakpointPanel";
import { CostPanel } from "@/components/panels/CostPanel";
import { EventLog } from "@/components/panels/EventLog";
import { MemoryDebugger } from "@/components/panels/MemoryDebugger";
import { InjectionEditor } from "@/components/panels/InjectionEditor";
import { RootCausePanel } from "@/components/panels/RootCausePanel";
import { ComparatorPanel } from "@/components/panels/ComparatorPanel";
import { AnomalyBanner } from "@/components/shared/AnomalyBanner";
import { SessionBar } from "@/components/shared/SessionBar";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useEventProcessor } from "@/hooks/useEventProcessor";
import { useAnomalyStore } from "@/stores/anomalyStore";
import { useSessionStore } from "@/stores/sessionStore";
import type { DashboardCommand } from "@/lib/types";

type BottomTab = "timeline" | "breakpoints" | "inject" | "memory" | "cost" | "rootcause" | "comparator" | "events";

const BOTTOM_TABS: { id: BottomTab; label: string; icon: React.ReactNode }[] = [
  { id: "timeline", label: "Timeline", icon: <Clock size={13} /> },
  { id: "breakpoints", label: "Breakpoints", icon: <Crosshair size={13} /> },
  { id: "inject", label: "Inject", icon: <Syringe size={13} /> },
  { id: "memory", label: "Memory", icon: <Brain size={13} /> },
  { id: "cost", label: "Cost", icon: <DollarSign size={13} /> },
  { id: "rootcause", label: "Root Cause", icon: <Bug size={13} /> },
  { id: "comparator", label: "Comparator", icon: <GitCompare size={13} /> },
  { id: "events", label: "Events", icon: <List size={13} /> },
];

export default function DashboardPage() {
  const [bottomTab, setBottomTab] = useState<BottomTab>("events");
  const [bottomHeight, setBottomHeight] = useState(220);
  const [rightWidth, setRightWidth] = useState(380);
  const [isDraggingH, setIsDraggingH] = useState(false);
  const [isDraggingV, setIsDraggingV] = useState(false);

  const { processEvents, processTopology } = useEventProcessor();
  const pushAlert = useAnomalyStore((s) => s.pushAlert);
  const setMySession = useSessionStore((s) => s.setMySession);
  const addPeer = useSessionStore((s) => s.addPeer);
  const removePeer = useSessionStore((s) => s.removePeer);
  const updatePeerCursor = useSessionStore((s) => s.updatePeerCursor);

  const processAnomaly = useCallback(
    (raw: Record<string, unknown>) => {
      pushAlert({
        type: (raw.type as string) as "infinite_loop" | "cost_spike" | "context_bloat" | "handoff_cycle",
        agentId: (raw.agent_id as string) ?? "",
        swarmId: (raw.swarm_id as string) ?? "",
        message: (raw.message as string) ?? "Unknown anomaly",
        severity: (raw.severity as string) ?? "warn",
        detectedAt: (raw.detected_at as string) ?? new Date().toISOString(),
        details: (raw.details as Record<string, unknown>) ?? {},
        dismissed: false,
      });
    },
    [pushAlert]
  );

  const processSession = useCallback(
    (payload: Record<string, unknown>) => {
      const action = payload.action as string;
      const sessionId = payload.session_id as string;
      const userName = payload.user_name as string;
      const color = payload.color as string;

      if (action === "join" && payload.active_sessions) {
        setMySession({ session_id: sessionId, user_name: userName, color });
        const sessions = payload.active_sessions as Array<{ session_id: string; user_name: string; color: string }>;
        for (const s of sessions) {
          if (s.session_id !== sessionId) {
            addPeer({ ...s, last_seen: Date.now() });
          }
        }
      } else if (action === "join") {
        addPeer({ session_id: sessionId, user_name: userName, color, last_seen: Date.now() });
      } else if (action === "leave") {
        removePeer(sessionId);
      } else if (action === "cursor" || action === "selection") {
        updatePeerCursor(
          sessionId,
          payload.cursor as { node_id?: string; panel?: string } | undefined,
          payload.selected_agent_id as string | undefined,
        );
      }
    },
    [setMySession, addPeer, removePeer, updatePeerCursor]
  );

  const { status, sendCommand } = useWebSocket({
    onEvent: processEvents,
    onTopology: processTopology,
    onAnomaly: processAnomaly,
    onSession: processSession,
  });

  const handleSendCommand = useCallback(
    (cmd: DashboardCommand) => sendCommand(cmd),
    [sendCommand]
  );

  // Horizontal resize (right panel width)
  const onHDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDraggingH(true);
      const startX = e.clientX;
      const startWidth = rightWidth;

      const onMove = (ev: MouseEvent) => {
        const delta = startX - ev.clientX;
        setRightWidth(Math.max(280, Math.min(600, startWidth + delta)));
      };

      const onUp = () => {
        setIsDraggingH(false);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [rightWidth]
  );

  // Vertical resize (bottom panel height)
  const onVDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDraggingV(true);
      const startY = e.clientY;
      const startHeight = bottomHeight;

      const onMove = (ev: MouseEvent) => {
        const delta = startY - ev.clientY;
        setBottomHeight(Math.max(120, Math.min(500, startHeight + delta)));
      };

      const onUp = () => {
        setIsDraggingV(false);
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };

      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [bottomHeight]
  );

  const renderBottomPanel = () => {
    switch (bottomTab) {
      case "timeline":
        return <TimelinePanel />;
      case "breakpoints":
        return <BreakpointPanel />;
      case "inject":
        return <InjectionEditor onSendCommand={handleSendCommand} />;
      case "memory":
        return <MemoryDebugger />;
      case "cost":
        return <CostPanel />;
      case "rootcause":
        return <RootCausePanel />;
      case "comparator":
        return <ComparatorPanel />;
      case "events":
        return <EventLog />;
    }
  };

  return (
    <div
      className="h-screen w-screen flex flex-col overflow-hidden"
      style={{
        backgroundColor: "#0A0A0B",
        cursor: isDraggingH || isDraggingV ? "col-resize" : undefined,
      }}
    >
      {/* Top bar */}
      <TopBar connectionStatus={status} onSendCommand={handleSendCommand} />

      {/* Anomaly alerts */}
      <AnomalyBanner />

      {/* Collaborative session bar */}
      <SessionBar />

      {/* Main area */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: Topology Canvas */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Canvas */}
          <div className="flex-1 min-h-0">
            <TopologyCanvas />
          </div>

          {/* Vertical resize handle */}
          <div
            className="h-1 cursor-row-resize shrink-0 hover:bg-[#10B98140] transition-colors"
            style={{
              backgroundColor: isDraggingV ? "#10B98160" : "#222225",
            }}
            onMouseDown={onVDragStart}
          />

          {/* Bottom panel */}
          <div className="shrink-0" style={{ height: bottomHeight }}>
            {/* Tab bar */}
            <div
              className="flex border-b shrink-0"
              style={{
                backgroundColor: "#0A0A0B",
                borderColor: "#222225",
              }}
            >
              {BOTTOM_TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setBottomTab(tab.id)}
                  className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-display font-medium uppercase tracking-wider transition-colors"
                  style={{
                    color: bottomTab === tab.id ? "#10B981" : "#71717A",
                    borderBottom:
                      bottomTab === tab.id
                        ? "2px solid #10B981"
                        : "2px solid transparent",
                  }}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Panel content */}
            <div
              className="overflow-hidden"
              style={{
                height: bottomHeight - 34,
                backgroundColor: "#111113",
              }}
            >
              {renderBottomPanel()}
            </div>
          </div>
        </div>

        {/* Horizontal resize handle */}
        <div
          className="w-1 cursor-col-resize shrink-0 hover:bg-[#10B98140] transition-colors"
          style={{
            backgroundColor: isDraggingH ? "#10B98160" : "#222225",
          }}
          onMouseDown={onHDragStart}
        />

        {/* Right: Agent Inspector */}
        <div className="shrink-0 overflow-hidden" style={{ width: rightWidth }}>
          <AgentInspector />
        </div>
      </div>
    </div>
  );
}
