#!/usr/bin/env node

/**
 * @sutures/collector — Central WebSocket collector server for Sutures.
 *
 * Receives AgentEvents from adapters, manages breakpoints, stores checkpoints,
 * detects anomalies, and broadcasts to dashboard clients.
 *
 * Usage:
 *   node dist/index.js                    # Start with defaults
 *   SUTURES_WS_PORT=9470 node dist/index.js  # Custom port via env
 */

// ── Barrel Exports ─────────────────────────────────────────────

export { createCollectorServer, type CollectorServer, type CollectorServerConfig } from './server.js';
export { EventRouter, type EventRouterConfig } from './eventRouter.js';
export { RingBuffer } from './ringBuffer.js';
export { CheckpointStore } from './checkpointStore.js';
export { BreakpointController, type BreakpointMatch, type InjectionPayload } from './breakpointController.js';
export { AnomalyEngine } from './anomalyEngine.js';
export { OtelExporter, type OtelExporterConfig } from './otelExporter.js';

export {
  AgentEventSchema,
  AgentEventTypeSchema,
  SeveritySchema,
  BreakpointConfigSchema,
  BreakpointConditionTypeSchema,
  CheckpointSchema,
  CommandTypeSchema,
  AdapterMessageSchema,
  DashboardCommandSchema,
  InboundMessageSchema,
  type AgentEvent,
  type AgentEventType,
  type Severity,
  type BreakpointConfig,
  type BreakpointConditionType,
  type Checkpoint,
  type CommandType,
  type AdapterMessage,
  type DashboardCommand,
  type InboundMessage,
  type OutboundMessage,
  type OutboundEventMessage,
  type OutboundResponseMessage,
  type OutboundTopologyMessage,
  type OutboundAnomalyMessage,
  type SwarmTopology,
  type TopologyAgent,
  type TopologyEdge,
  type AnomalyAlert,
} from './schemas.js';

// ── CLI Entry Point ────────────────────────────────────────────

import { createCollectorServer } from './server.js';

/**
 * Start the collector with configuration from environment variables.
 */
export async function startCollector(): Promise<void> {
  const config = {
    wsPort: parseInt(process.env['SUTURES_WS_PORT'] ?? '9470', 10),
    httpPort: parseInt(process.env['SUTURES_HTTP_PORT'] ?? '9471', 10),
    host: process.env['SUTURES_HOST'] ?? '0.0.0.0',
    checkpointDbPath: process.env['SUTURES_CHECKPOINT_DB'] ?? './sutures-checkpoints.db',
    otelEnabled: process.env['SUTURES_OTEL_ENABLED'] === 'true',
    otelEndpoint: process.env['SUTURES_OTEL_ENDPOINT'] ?? 'http://localhost:4318/v1/traces',
    corsOrigin: process.env['SUTURES_CORS_ORIGIN'] ?? '*',
    ringBufferCapacity: parseInt(process.env['SUTURES_RING_BUFFER_SIZE'] ?? '10000', 10),
  };

  const server = createCollectorServer(config);

  // Graceful shutdown
  const shutdown = async () => {
    await server.stop();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await server.start();
}

// Run if executed directly (not imported)
const isMainModule = process.argv[1]?.endsWith('index.js') ||
  process.argv[1]?.endsWith('index.mjs');

if (isMainModule) {
  startCollector().catch((err) => {
    console.error('[Collector] Fatal error:', err);
    process.exit(1);
  });
}
