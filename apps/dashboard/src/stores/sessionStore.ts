"use client";

import { create } from "zustand";

export interface SessionUser {
  session_id: string;
  user_name: string;
  color: string;
  cursor?: { node_id?: string; panel?: string; x?: number; y?: number };
  selected_agent_id?: string;
  last_seen: number;
}

interface SessionState {
  /** Current user's session info */
  mySession: { session_id: string; user_name: string; color: string } | null;
  /** All remote sessions */
  peers: Map<string, SessionUser>;
  setMySession: (session: { session_id: string; user_name: string; color: string }) => void;
  addPeer: (peer: SessionUser) => void;
  removePeer: (sessionId: string) => void;
  updatePeerCursor: (sessionId: string, cursor: SessionUser["cursor"], selectedAgentId?: string) => void;
  peerCount: () => number;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  mySession: null,
  peers: new Map(),

  setMySession: (session) => set({ mySession: session }),

  addPeer: (peer) =>
    set((s) => {
      const peers = new Map(s.peers);
      peers.set(peer.session_id, { ...peer, last_seen: Date.now() });
      return { peers };
    }),

  removePeer: (sessionId) =>
    set((s) => {
      const peers = new Map(s.peers);
      peers.delete(sessionId);
      return { peers };
    }),

  updatePeerCursor: (sessionId, cursor, selectedAgentId) =>
    set((s) => {
      const peers = new Map(s.peers);
      const existing = peers.get(sessionId);
      if (existing) {
        peers.set(sessionId, {
          ...existing,
          cursor,
          selected_agent_id: selectedAgentId,
          last_seen: Date.now(),
        });
      }
      return { peers };
    }),

  peerCount: () => get().peers.size,
}));
