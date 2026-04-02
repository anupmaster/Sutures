"use client";

import React, { useMemo, useState } from "react";
import { AlertCircle, ChevronRight, Search, ArrowRight } from "lucide-react";
import { useEventStore } from "@/stores/eventStore";
import { useSwarmStore } from "@/stores/swarmStore";
import { useAnomalyStore } from "@/stores/anomalyStore";

interface ErrorChainLink {
  agentId: string;
  agentName: string;
  eventType: string;
  message: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

interface RootCauseAnalysis {
  errorEvent: ErrorChainLink;
  chain: ErrorChainLink[];
  suggestedFix: string;
  confidence: number;
}

function analyzeRootCause(
  events: { id: string; type: string; agentId: string; agentName: string; timestamp: string; payload: Record<string, unknown> }[],
  agents: Map<string, { name: string }>,
): RootCauseAnalysis[] {
  const analyses: RootCauseAnalysis[] = [];

  // Find all error/failure events
  const errorEvents = events.filter(
    (e) =>
      e.type === "agent.failed" ||
      e.type === "turn.failed" ||
      e.type.includes("error") ||
      e.type.includes("violation") ||
      e.type.includes("conflict")
  );

  for (const errorEvent of errorEvents) {
    const agentName = agents.get(errorEvent.agentId)?.name ?? errorEvent.agentId;
    const chain: ErrorChainLink[] = [];

    // Walk backwards from the error to find causal events
    const agentEvents = events.filter(
      (e) => e.agentId === errorEvent.agentId && e.id !== errorEvent.id && e.timestamp <= errorEvent.timestamp
    );
    const precedingEvents = agentEvents.slice(-10); // last 10 events before error

    for (const prev of precedingEvents) {
      chain.push({
        agentId: prev.agentId,
        agentName: agents.get(prev.agentId)?.name ?? prev.agentId,
        eventType: prev.type,
        message: describeEvent(prev),
        timestamp: prev.timestamp,
        payload: prev.payload,
      });
    }

    // Look for handoff source — if error happened right after a handoff
    const handoffBefore = events.find(
      (e) =>
        e.type === "handoff.initiated" &&
        (e.payload.target_agent_id as string) === errorEvent.agentId &&
        e.timestamp <= errorEvent.timestamp
    );
    if (handoffBefore) {
      chain.unshift({
        agentId: handoffBefore.agentId,
        agentName: agents.get(handoffBefore.agentId)?.name ?? handoffBefore.agentId,
        eventType: "handoff.initiated",
        message: `Handoff from ${agents.get(handoffBefore.agentId)?.name ?? handoffBefore.agentId}`,
        timestamp: handoffBefore.timestamp,
        payload: handoffBefore.payload,
      });
    }

    // Generate suggested fix based on error type
    const suggestedFix = generateSuggestedFix(errorEvent, chain);
    const confidence = calculateConfidence(chain);

    analyses.push({
      errorEvent: {
        agentId: errorEvent.agentId,
        agentName,
        eventType: errorEvent.type,
        message: describeEvent(errorEvent),
        timestamp: errorEvent.timestamp,
        payload: errorEvent.payload,
      },
      chain,
      suggestedFix,
      confidence,
    });
  }

  return analyses;
}

function describeEvent(event: { type: string; payload: Record<string, unknown> }): string {
  const p = event.payload;
  switch (event.type) {
    case "agent.failed":
      return (p.error as string) ?? (p.message as string) ?? "Agent failed";
    case "turn.failed":
      return (p.error as string) ?? "Turn execution failed";
    case "turn.acting":
      return `Called tool: ${(p.tool_name as string) ?? "unknown"}`;
    case "turn.observed":
      return `Tool result: ${(p.tool_output_summary as string)?.slice(0, 80) ?? "..."}`;
    case "turn.thinking":
      return `Thinking: ${(p.content as string)?.slice(0, 80) ?? "..."}`;
    case "turn.started":
      return `Turn ${(p.turn_number as number) ?? "?"} started`;
    case "handoff.initiated":
      return `Handoff to ${(p.target_agent_id as string) ?? "?"}`;
    case "memory.conflict":
      return `Memory conflict on key "${(p.key as string) ?? "?"}"`;
    case "memory.coherence_violation":
      return `Cache coherence violation: ${(p.key as string) ?? "?"}`;
    default:
      return event.type;
  }
}

function generateSuggestedFix(
  errorEvent: { type: string; payload: Record<string, unknown> },
  chain: ErrorChainLink[]
): string {
  const hasToolFailure = chain.some((e) => e.eventType === "turn.acting");
  const hasMemoryConflict = chain.some((e) => e.eventType === "memory.conflict");
  const hasHandoff = chain.some((e) => e.eventType === "handoff.initiated");
  const repeatedTools = findRepeatedTools(chain);

  if (repeatedTools) {
    return `Agent is looping on tool "${repeatedTools}". Consider adding a max-retry limit or breaking the loop with a different tool call.`;
  }
  if (hasMemoryConflict) {
    return "Memory conflict detected in the chain. Consider adding a conflict resolution strategy or using versioned memory keys.";
  }
  if (hasHandoff && hasToolFailure) {
    return "Error occurred after a handoff during a tool call. Check that the receiving agent has access to the required tools and context.";
  }
  if (hasToolFailure) {
    return "Tool call failure in the chain. Verify tool inputs, check external service availability, or add error handling/retries.";
  }
  if (errorEvent.type === "agent.failed") {
    return "Agent failed. Check the error message for details, verify the agent's system prompt, and ensure all required tools are available.";
  }
  return "Review the event chain for unusual patterns. Consider adding breakpoints at earlier stages to catch the issue before it propagates.";
}

function findRepeatedTools(chain: ErrorChainLink[]): string | null {
  const tools = chain
    .filter((e) => e.eventType === "turn.acting" && e.payload.tool_name)
    .map((e) => e.payload.tool_name as string);
  if (tools.length >= 3) {
    const last3 = tools.slice(-3);
    if (last3.every((t) => t === last3[0])) return last3[0];
  }
  return null;
}

function calculateConfidence(chain: ErrorChainLink[]): number {
  // More events in chain = higher confidence in root cause
  const base = Math.min(0.9, 0.4 + chain.length * 0.05);
  // Bonus for having tool calls or handoffs (clearer causal chain)
  const hasTools = chain.some((e) => e.eventType === "turn.acting") ? 0.1 : 0;
  const hasHandoff = chain.some((e) => e.eventType === "handoff.initiated") ? 0.05 : 0;
  return Math.min(0.95, base + hasTools + hasHandoff);
}

// ── Main Component ──────────────────────────────────

export function RootCausePanel() {
  const events = useEventStore((s) => s.events);
  const agents = useSwarmStore((s) => s.agents);
  const anomalyAlerts = useAnomalyStore((s) => s.alerts);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);

  const analyses = useMemo(
    () => analyzeRootCause(events, agents as Map<string, { name: string }>),
    [events, agents]
  );

  const hasIssues = analyses.length > 0 || anomalyAlerts.length > 0;

  if (!hasIssues) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: "#10B98120" }}
        >
          <Search size={18} style={{ color: "#10B981" }} />
        </div>
        <div>
          <p className="text-xs font-display font-semibold" style={{ color: "#F5F5F5" }}>
            No issues detected
          </p>
          <p className="text-[10px] font-body mt-1" style={{ color: "#71717A" }}>
            Root cause analysis will appear here when errors, failures, or
            anomalies are detected in your agent swarm.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Summary bar */}
      <div
        className="flex items-center gap-3 px-3 py-2 border-b shrink-0"
        style={{ borderColor: "#222225" }}
      >
        <AlertCircle size={14} style={{ color: "#EF4444" }} />
        <span className="text-[11px] font-display font-semibold" style={{ color: "#F5F5F5" }}>
          {analyses.length} error{analyses.length !== 1 ? "s" : ""} analyzed
        </span>
        {anomalyAlerts.length > 0 && (
          <span className="text-[10px] font-display" style={{ color: "#F59E0B" }}>
            + {anomalyAlerts.filter((a) => !a.dismissed).length} anomalies
          </span>
        )}
      </div>

      {/* Analysis list */}
      <div className="flex-1 overflow-y-auto">
        {analyses.map((analysis, i) => {
          const isExpanded = expandedIdx === i;
          return (
            <div
              key={i}
              className="border-b"
              style={{ borderColor: "#222225" }}
            >
              {/* Header */}
              <button
                onClick={() => setExpandedIdx(isExpanded ? null : i)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-[#1A1A1D] transition-colors text-left"
              >
                <ChevronRight
                  size={12}
                  className="shrink-0 transition-transform"
                  style={{
                    color: "#71717A",
                    transform: isExpanded ? "rotate(90deg)" : undefined,
                  }}
                />
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: "#EF4444" }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] font-display font-semibold truncate" style={{ color: "#F5F5F5" }}>
                    {analysis.errorEvent.agentName}: {analysis.errorEvent.eventType}
                  </div>
                  <div className="text-[10px] font-body truncate" style={{ color: "#71717A" }}>
                    {analysis.errorEvent.message}
                  </div>
                </div>
                <span
                  className="px-1.5 py-0.5 rounded text-[9px] font-display font-bold shrink-0"
                  style={{
                    backgroundColor: analysis.confidence > 0.7 ? "#10B98120" : "#F59E0B20",
                    color: analysis.confidence > 0.7 ? "#10B981" : "#F59E0B",
                  }}
                >
                  {Math.round(analysis.confidence * 100)}%
                </span>
              </button>

              {/* Expanded detail */}
              {isExpanded && (
                <div className="px-3 pb-3">
                  {/* Suggested fix */}
                  <div
                    className="rounded-lg p-2.5 mb-3"
                    style={{ backgroundColor: "#10B98110", border: "1px solid #10B98130" }}
                  >
                    <div className="text-[10px] font-display font-semibold mb-1" style={{ color: "#10B981" }}>
                      Suggested Fix
                    </div>
                    <p className="text-[11px] font-body leading-relaxed" style={{ color: "#A1A1AA" }}>
                      {analysis.suggestedFix}
                    </p>
                  </div>

                  {/* Event chain */}
                  <div className="text-[10px] font-display font-medium mb-1.5" style={{ color: "#71717A" }}>
                    Event Chain ({analysis.chain.length} events)
                  </div>
                  <div className="space-y-1">
                    {analysis.chain.map((link, j) => (
                      <div key={j} className="flex items-start gap-2">
                        <div className="flex flex-col items-center mt-1.5">
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{
                              backgroundColor:
                                link.eventType.includes("fail") || link.eventType.includes("error")
                                  ? "#EF4444"
                                  : link.eventType.includes("handoff")
                                  ? "#3B82F6"
                                  : "#6B7280",
                            }}
                          />
                          {j < analysis.chain.length - 1 && (
                            <div className="w-px h-3" style={{ backgroundColor: "#222225" }} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0 pb-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-display font-semibold" style={{ color: "#F5F5F5" }}>
                              {link.agentName}
                            </span>
                            <ArrowRight size={8} style={{ color: "#71717A" }} />
                            <span className="text-[10px] font-display" style={{ color: "#A1A1AA" }}>
                              {link.eventType}
                            </span>
                          </div>
                          <p className="text-[9px] font-body truncate" style={{ color: "#71717A" }}>
                            {link.message}
                          </p>
                        </div>
                        <span className="text-[9px] font-display shrink-0 mt-0.5" style={{ color: "#71717A" }}>
                          {new Date(link.timestamp).toLocaleTimeString(undefined, {
                            hour12: false,
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
