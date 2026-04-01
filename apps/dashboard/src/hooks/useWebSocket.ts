"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentEvent,
  ConnectionStatus,
  DashboardCommand,
  SwarmTopology,
} from "@/lib/types";
import { WS_URL, WS_BATCH_INTERVAL_MS } from "@/lib/constants";

interface SessionPayload {
  action: "join" | "leave" | "cursor" | "selection";
  session_id: string;
  user_name: string;
  color: string;
  cursor?: { node_id?: string; panel?: string; x?: number; y?: number };
  selected_agent_id?: string;
  active_sessions?: Array<{ session_id: string; user_name: string; color: string }>;
}

interface WebSocketHookOptions {
  onEvent?: (events: AgentEvent[]) => void;
  onTopology?: (topology: Record<string, unknown>) => void;
  onAnomaly?: (anomaly: Record<string, unknown>) => void;
  onSession?: (payload: Record<string, unknown>) => void;
  userName?: string;
}

interface WebSocketHook {
  status: ConnectionStatus;
  sendCommand: (command: DashboardCommand) => void;
  sendSession: (payload: Partial<SessionPayload>) => void;
}

export function useWebSocket(options: WebSocketHookOptions): WebSocketHook {
  const { onEvent, onTopology, onAnomaly, onSession, userName } = options;
  const [status, setStatus] = useState<ConnectionStatus>("disconnected");
  const wsRef = useRef<WebSocket | null>(null);
  const batchRef = useRef<AgentEvent[]>([]);
  const batchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);

  // Stable refs for callbacks
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onTopologyRef = useRef(onTopology);
  onTopologyRef.current = onTopology;
  const onAnomalyRef = useRef(onAnomaly);
  onAnomalyRef.current = onAnomaly;
  const onSessionRef = useRef(onSession);
  onSessionRef.current = onSession;
  const userNameRef = useRef(userName);
  userNameRef.current = userName;

  const flushBatch = useCallback(() => {
    if (batchRef.current.length > 0) {
      const batch = batchRef.current;
      batchRef.current = [];
      onEventRef.current?.(batch);
    }
    batchTimerRef.current = null;
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus("connecting");
    const ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      setStatus("connected");
      reconnectAttemptsRef.current = 0;
      // Auto-join collaborative session
      ws.send(JSON.stringify({
        type: "session",
        payload: { action: "join", user_name: userNameRef.current ?? `User ${Math.floor(Math.random() * 1000)}` },
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "event" && data.payload) {
          batchRef.current.push(data.payload as AgentEvent);
          if (!batchTimerRef.current) {
            batchTimerRef.current = setTimeout(
              flushBatch,
              WS_BATCH_INTERVAL_MS
            );
          }
        } else if (data.type === "topology" && data.payload) {
          onTopologyRef.current?.(data.payload as Record<string, unknown>);
        } else if (data.type === "anomaly" && data.payload) {
          onAnomalyRef.current?.(data.payload as Record<string, unknown>);
        } else if (data.type === "session" && data.payload) {
          onSessionRef.current?.(data.payload as Record<string, unknown>);
        }
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onclose = () => {
      setStatus("disconnected");
      wsRef.current = null;
      scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };

    wsRef.current = ws;
  }, [flushBatch]);

  const scheduleReconnect = useCallback(() => {
    const attempts = reconnectAttemptsRef.current;
    const delay = Math.min(1000 * Math.pow(2, attempts), 30000);
    reconnectAttemptsRef.current = attempts + 1;

    reconnectTimerRef.current = setTimeout(() => {
      connect();
    }, delay);
  }, [connect]);

  const sendCommand = useCallback((command: DashboardCommand) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(command));
    }
  }, []);

  const sendSession = useCallback((payload: Partial<SessionPayload>) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "session", payload }));
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { status, sendCommand, sendSession };
}
