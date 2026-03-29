"use client";

import React from "react";
import type { ContextMessage } from "@/lib/types";

const ROLE_STYLES: Record<
  ContextMessage["role"],
  { label: string; color: string; bgColor: string }
> = {
  user: { label: "USR", color: "#3B82F6", bgColor: "#3B82F620" },
  assistant: { label: "AST", color: "#10B981", bgColor: "#10B98120" },
  system: { label: "SYS", color: "#8B5CF6", bgColor: "#8B5CF620" },
  tool: { label: "TL", color: "#F59E0B", bgColor: "#F59E0B20" },
};

interface ContextViewerProps {
  messages: ContextMessage[];
}

export function ContextViewer({ messages }: ContextViewerProps) {
  if (messages.length === 0) {
    return (
      <div
        className="h-full flex items-center justify-center text-sm font-body"
        style={{ color: "#71717A" }}
      >
        No messages yet
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-2">
      {messages.map((msg, i) => {
        const style = ROLE_STYLES[msg.role];
        return (
          <div key={i} className="rounded-md p-2.5" style={{ backgroundColor: "#1A1A1D" }}>
            <div className="flex items-center justify-between mb-1.5">
              <span
                className="px-1.5 py-0.5 rounded text-[10px] font-display font-bold uppercase"
                style={{ backgroundColor: style.bgColor, color: style.color }}
              >
                {style.label}
              </span>
              <div className="flex items-center gap-2">
                {msg.tokenCount != null && (
                  <span
                    className="text-[10px] font-display"
                    style={{ color: "#71717A" }}
                  >
                    {msg.tokenCount.toLocaleString()} tok
                  </span>
                )}
                <span
                  className="text-[10px] font-display"
                  style={{ color: "#71717A" }}
                >
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </div>
            </div>
            <p
              className="text-xs font-body leading-relaxed whitespace-pre-wrap break-words"
              style={{ color: "#A1A1AA" }}
            >
              {msg.content}
            </p>
          </div>
        );
      })}
    </div>
  );
}
