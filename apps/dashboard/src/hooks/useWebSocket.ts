"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  AgentEvent,
  ConnectionStatus,
  DashboardCommand,
  SwarmTopology,
} from "@/lib/types";
import { WS_URL, WS_BATCH_INTERVAL_MS } from "@/lib/constants";

interface WebSocketHookOptions {
  onEvent?: (events: AgentEvent[]) => void;
  onTopology?: (topology: SwarmTopology) => void;
}

interface WebSocketHook {
  status: ConnectionStatus;
  sendCommand: (command: DashboardCommand) => void;
}

export function useWebSocket(options: WebSocketHookOptions): WebSocketHook {
  const { onEvent, onTopology } = options;
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
          onTopologyRef.current?.(data.payload as SwarmTopology);
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

  useEffect(() => {
    connect();

    return () => {
      if (batchTimerRef.current) clearTimeout(batchTimerRef.current);
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { status, sendCommand };
}
