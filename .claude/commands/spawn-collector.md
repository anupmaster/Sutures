# Spawn Collector Subagent

## Context
You are building the Sutures Collector Server — the central WebSocket hub that receives AgentEvents from adapters, stores checkpoints, manages breakpoints, and broadcasts to dashboard clients.

## Pre-Read (MANDATORY)
Read these files before writing ANY code:
- CLAUDE.md (Section: System Architecture, Tech Stack)
- AGENT_EVENT_PROTOCOL.md (all 32 event types)
- SUTURES_GROK_TECHNICAL_VALIDATION.md (Section 5: Checkpointer Reference)
- packages/core/types.ts (type definitions to import)

## Scope: packages/collector/

## Deliverables
1. `server.ts` — Fastify server with @fastify/websocket on port 9470 (WS) and 9471 (HTTP)
2. `eventRouter.ts` — Receives AgentEvents via WS, validates with Zod against @sutures/core types, routes to stores + broadcast to dashboard clients
3. `ringBuffer.ts` — In-memory circular buffer holding last 10K events
4. `checkpointStore.ts` — better-sqlite3 for checkpoint persistence (key: checkpoint_id, value: serialized state)
5. `breakpointController.ts` — Manages all 13 breakpoint conditions. Receives set/release/inject commands from dashboard. Forwards to adapters via WS
6. `anomalyEngine.ts` — Detects: infinite loops (3+ identical tool calls), cost spikes (>3x avg), context bloat (>10%/turn), handoff cycles (A→B→A→B)
7. `otelExporter.ts` — Optional OTEL span export using @opentelemetry/exporter-trace-otlp-http
8. `index.ts` — Barrel exports
9. `package.json` — Dependencies: fastify, @fastify/websocket, better-sqlite3, zod, @sutures/core

## Acceptance Criteria
- [ ] Handles 100+ events/sec without drops
- [ ] WS reconnects gracefully on adapter disconnect
- [ ] Breakpoint commands relay to correct adapter within 100ms
- [ ] SQLite writes don't block event processing (async)
- [ ] All events validated against Zod schema before storage
- [ ] Anomaly detection runs without blocking main event loop
