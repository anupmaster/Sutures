"use client";

import React from "react";
import { CheckCircle, XCircle } from "lucide-react";
import type { ToolCallRecord } from "@/lib/types";

interface ToolCallLogProps {
  toolCalls: ToolCallRecord[];
}

export function ToolCallLog({ toolCalls }: ToolCallLogProps) {
  if (toolCalls.length === 0) {
    return (
      <div
        className="h-full flex items-center justify-center text-sm font-body"
        style={{ color: "#71717A" }}
      >
        No tool calls yet
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <table className="w-full text-xs font-body">
        <thead>
          <tr
            className="sticky top-0"
            style={{ backgroundColor: "#111113" }}
          >
            <th
              className="text-left px-3 py-2 font-display font-medium"
              style={{ color: "#71717A" }}
            >
              #
            </th>
            <th
              className="text-left px-3 py-2 font-display font-medium"
              style={{ color: "#71717A" }}
            >
              Tool
            </th>
            <th
              className="text-left px-3 py-2 font-display font-medium"
              style={{ color: "#71717A" }}
            >
              Input
            </th>
            <th
              className="text-left px-3 py-2 font-display font-medium"
              style={{ color: "#71717A" }}
            >
              Output
            </th>
            <th
              className="text-right px-3 py-2 font-display font-medium"
              style={{ color: "#71717A" }}
            >
              Latency
            </th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {toolCalls.map((tc, i) => (
            <tr
              key={i}
              className="border-t hover:bg-[#1A1A1D] transition-colors"
              style={{ borderColor: "#222225" }}
            >
              <td className="px-3 py-2" style={{ color: "#71717A" }}>
                {tc.turn}
              </td>
              <td className="px-3 py-2">
                <span
                  className="font-display font-medium"
                  style={{ color: "#F5F5F5" }}
                >
                  {tc.toolName}
                </span>
              </td>
              <td
                className="px-3 py-2 max-w-[120px] truncate"
                style={{ color: "#A1A1AA" }}
                title={tc.inputSummary}
              >
                {tc.inputSummary}
              </td>
              <td
                className="px-3 py-2 max-w-[120px] truncate"
                style={{ color: "#A1A1AA" }}
                title={tc.outputSummary}
              >
                {tc.outputSummary}
              </td>
              <td
                className="px-3 py-2 text-right font-display"
                style={{ color: "#A1A1AA" }}
              >
                {tc.latencyMs}ms
              </td>
              <td className="px-3 py-2 text-center">
                {tc.success ? (
                  <CheckCircle size={14} style={{ color: "#10B981" }} />
                ) : (
                  <XCircle size={14} style={{ color: "#EF4444" }} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
