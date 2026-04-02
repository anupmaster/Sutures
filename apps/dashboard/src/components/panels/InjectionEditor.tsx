"use client";

import React, { useState, useMemo, useCallback } from "react";
import { Play, Plus, Trash2, AlertTriangle } from "lucide-react";
import { useSwarmStore } from "@/stores/swarmStore";
import { useBreakpointStore } from "@/stores/breakpointStore";
import type { DashboardCommand } from "@/lib/types";

type InjectionMode = "append" | "replace";

interface InjectionMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
}

interface InjectionEditorProps {
  onSendCommand: (cmd: DashboardCommand) => void;
}

const ROLE_OPTIONS: { value: InjectionMessage["role"]; label: string; color: string }[] = [
  { value: "user", label: "User", color: "#3B82F6" },
  { value: "assistant", label: "Assistant", color: "#10B981" },
  { value: "system", label: "System", color: "#8B5CF6" },
  { value: "tool", label: "Tool", color: "#F59E0B" },
];

export function InjectionEditor({ onSendCommand }: InjectionEditorProps) {
  const agents = useSwarmStore((s) => s.agents);
  const hits = useBreakpointStore((s) => s.hits);

  // Find paused agents (agents at a breakpoint)
  const pausedAgents = useMemo(
    () => Array.from(agents.values()).filter((a) => a.state === "paused"),
    [agents]
  );

  const [selectedAgentId, setSelectedAgentId] = useState<string>("");
  const [mode, setMode] = useState<InjectionMode>("append");
  const [messages, setMessages] = useState<InjectionMessage[]>([]);
  const [stateJson, setStateJson] = useState("");
  const [sending, setSending] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Auto-select first paused agent
  const effectiveAgentId = selectedAgentId || (pausedAgents[0]?.id ?? "");
  const selectedAgent = effectiveAgentId ? agents.get(effectiveAgentId) : null;

  const addMessage = useCallback(() => {
    setMessages((prev) => [...prev, { role: "user", content: "" }]);
  }, []);

  const removeMessage = useCallback((idx: number) => {
    setMessages((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const updateMessage = useCallback((idx: number, field: keyof InjectionMessage, value: string) => {
    setMessages((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m))
    );
  }, []);

  const handleInject = useCallback(() => {
    if (!effectiveAgentId) return;
    setSending(true);

    const payload: Record<string, unknown> = {
      agent_id: effectiveAgentId,
      mode,
    };

    if (messages.length > 0) {
      payload.messages = messages.filter((m) => m.content.trim());
    }

    if (stateJson.trim()) {
      try {
        payload.state = JSON.parse(stateJson);
      } catch {
        // Invalid JSON — skip state injection
      }
    }

    onSendCommand({
      type: "command",
      command: "inject_and_resume",
      payload,
    });

    // Reset after sending
    setTimeout(() => {
      setSending(false);
      setMessages([]);
      setStateJson("");
    }, 500);
  }, [effectiveAgentId, mode, messages, stateJson, onSendCommand]);

  // No paused agents — show info state
  if (pausedAgents.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "#F59E0B20" }}
        >
          <AlertTriangle size={18} style={{ color: "#F59E0B" }} />
        </div>
        <div>
          <p className="text-xs font-display font-semibold" style={{ color: "#F5F5F5" }}>
            No agents paused
          </p>
          <p className="text-[10px] font-body mt-1" style={{ color: "#71717A" }}>
            Set a breakpoint to pause an agent, then use this panel to inject
            messages or modify state before resuming.
          </p>
        </div>
        {hits.length > 0 && (
          <div className="text-[10px] font-display" style={{ color: "#71717A" }}>
            {hits.length} breakpoint hit{hits.length !== 1 ? "s" : ""} recorded
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header: agent selector + mode toggle */}
      <div
        className="flex items-center gap-3 px-3 py-2 border-b shrink-0"
        style={{ borderColor: "#222225" }}
      >
        {/* Agent selector */}
        <select
          value={effectiveAgentId}
          onChange={(e) => setSelectedAgentId(e.target.value)}
          className="text-[11px] font-display font-semibold rounded px-2 py-1 outline-none"
          style={{
            backgroundColor: "#1A1A1D",
            color: "#F5F5F5",
            border: "1px solid #222225",
          }}
        >
          {pausedAgents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} (paused)
            </option>
          ))}
        </select>

        {/* Mode toggle */}
        <div className="flex rounded overflow-hidden ml-auto" style={{ border: "1px solid #222225" }}>
          {(["append", "replace"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className="px-2.5 py-1 text-[10px] font-display font-semibold uppercase tracking-wider transition-colors"
              style={{
                backgroundColor: mode === m ? "#10B98120" : "#1A1A1D",
                color: mode === m ? "#10B981" : "#71717A",
              }}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Content: scrollable */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Messages section */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-[10px] font-display font-medium uppercase tracking-wider"
              style={{ color: "#71717A" }}
            >
              Inject Messages
            </span>
            <button
              onClick={addMessage}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-display font-semibold transition-colors hover:brightness-110"
              style={{ backgroundColor: "#10B98120", color: "#10B981" }}
            >
              <Plus size={10} />
              Add
            </button>
          </div>

          {messages.length === 0 ? (
            <div
              className="text-[10px] font-body py-3 text-center rounded"
              style={{ color: "#71717A", backgroundColor: "#1A1A1D" }}
            >
              No messages to inject. Click &quot;Add&quot; to compose a message.
            </div>
          ) : (
            <div className="space-y-2">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className="rounded-lg p-2"
                  style={{ backgroundColor: "#1A1A1D", border: "1px solid #222225" }}
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <select
                      value={msg.role}
                      onChange={(e) => updateMessage(i, "role", e.target.value)}
                      className="text-[10px] font-display rounded px-1.5 py-0.5 outline-none"
                      style={{
                        backgroundColor: "#222225",
                        color: ROLE_OPTIONS.find((r) => r.value === msg.role)?.color ?? "#F5F5F5",
                      }}
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>
                          {r.label}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => removeMessage(i)}
                      className="ml-auto p-0.5 rounded hover:bg-[#222225] transition-colors"
                    >
                      <Trash2 size={11} style={{ color: "#71717A" }} />
                    </button>
                  </div>
                  <textarea
                    value={msg.content}
                    onChange={(e) => updateMessage(i, "content", e.target.value)}
                    placeholder="Message content..."
                    rows={2}
                    className="w-full text-[11px] font-body rounded px-2 py-1.5 outline-none resize-none"
                    style={{
                      backgroundColor: "#222225",
                      color: "#F5F5F5",
                      border: "1px solid transparent",
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* State injection section */}
        <div>
          <span
            className="text-[10px] font-display font-medium uppercase tracking-wider block mb-2"
            style={{ color: "#71717A" }}
          >
            State Override (JSON)
          </span>
          <textarea
            value={stateJson}
            onChange={(e) => {
              setStateJson(e.target.value);
              if (e.target.value.trim()) {
                try {
                  JSON.parse(e.target.value);
                  setJsonError(null);
                } catch {
                  setJsonError("Invalid JSON");
                }
              } else {
                setJsonError(null);
              }
            }}
            placeholder='{"key": "value"}'
            rows={3}
            className="w-full text-[11px] font-mono rounded px-2 py-1.5 outline-none resize-none"
            style={{
              backgroundColor: "#1A1A1D",
              color: "#F5F5F5",
              border: `1px solid ${jsonError ? "#EF4444" : "#222225"}`,
            }}
          />
          {jsonError && (
            <p className="text-[9px] font-display mt-0.5" style={{ color: "#EF4444" }}>
              {jsonError}
            </p>
          )}
        </div>

        {/* Agent context summary */}
        {selectedAgent && (
          <div
            className="rounded-lg p-2 text-[10px]"
            style={{ backgroundColor: "#1A1A1D", border: "1px solid #222225" }}
          >
            <div className="font-display font-medium mb-1" style={{ color: "#71717A" }}>
              Current Agent State
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <span style={{ color: "#71717A" }}>Turns: </span>
                <span className="font-display font-semibold" style={{ color: "#F5F5F5" }}>
                  {selectedAgent.turnCount}
                </span>
              </div>
              <div>
                <span style={{ color: "#71717A" }}>Messages: </span>
                <span className="font-display font-semibold" style={{ color: "#F5F5F5" }}>
                  {selectedAgent.contextMessages.length}
                </span>
              </div>
              <div>
                <span style={{ color: "#71717A" }}>Cost: </span>
                <span className="font-display font-semibold" style={{ color: "#F5F5F5" }}>
                  ${selectedAgent.cumulativeCost.toFixed(4)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer: inject + resume button */}
      <div className="shrink-0 px-3 py-2 border-t" style={{ borderColor: "#222225" }}>
        <button
          onClick={handleInject}
          disabled={sending || !effectiveAgentId || !!jsonError}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-display font-semibold transition-all hover:brightness-110 disabled:opacity-50"
          style={{ backgroundColor: "#10B981", color: "#0A0A0B" }}
        >
          <Play size={13} />
          {sending
            ? "Injecting..."
            : messages.length > 0 || stateJson.trim()
            ? `Inject ${mode === "append" ? "& Append" : "& Replace"} → Resume`
            : "Resume Agent"}
        </button>
      </div>
    </div>
  );
}
