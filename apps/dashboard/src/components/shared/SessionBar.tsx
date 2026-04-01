"use client";

import React from "react";
import { Users } from "lucide-react";
import { useSessionStore } from "@/stores/sessionStore";

export function SessionBar() {
  const mySession = useSessionStore((s) => s.mySession);
  const peers = useSessionStore((s) => s.peers);

  const peerList = Array.from(peers.values());
  const totalUsers = (mySession ? 1 : 0) + peerList.length;

  if (totalUsers <= 1) return null;

  return (
    <div
      className="flex items-center gap-2 px-3 py-1 border-b shrink-0"
      style={{ backgroundColor: "#111113", borderColor: "#222225" }}
    >
      <Users size={11} style={{ color: "#71717A" }} />
      <span className="text-[10px] font-display" style={{ color: "#71717A" }}>
        {totalUsers} connected
      </span>
      <div className="flex items-center gap-1 ml-1">
        {/* Current user */}
        {mySession && (
          <div
            className="flex items-center gap-1 px-1.5 py-0.5 rounded"
            style={{ backgroundColor: `${mySession.color}15` }}
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: mySession.color }}
            />
            <span
              className="text-[9px] font-display font-semibold"
              style={{ color: mySession.color }}
            >
              {mySession.user_name} (you)
            </span>
          </div>
        )}
        {/* Peers */}
        {peerList.map((peer) => (
          <div
            key={peer.session_id}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded"
            style={{ backgroundColor: `${peer.color}15` }}
            title={
              peer.selected_agent_id
                ? `Viewing: ${peer.selected_agent_id}`
                : undefined
            }
          >
            <div
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: peer.color }}
            />
            <span
              className="text-[9px] font-display font-medium"
              style={{ color: peer.color }}
            >
              {peer.user_name}
            </span>
            {peer.cursor?.panel && (
              <span
                className="text-[8px] font-body"
                style={{ color: "#71717A" }}
              >
                · {peer.cursor.panel}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
