/**
 * Server — Main Fastify server with WebSocket and REST endpoints.
 *
 * WS port 9470: Adapter and dashboard connections via /v1/events
 * HTTP port 9471: REST API for health, topology, events, checkpoints
 */

import Fastify, { type FastifyInstance } from 'fastify';
import fastifyWebSocket from '@fastify/websocket';
import fastifyCors from '@fastify/cors';
import type { WebSocket } from 'ws';
import { EventRouter, type EventRouterConfig } from './eventRouter.js';

export interface CollectorServerConfig extends EventRouterConfig {
  /** WebSocket server port for adapter + dashboard connections. Default: 9470 */
  wsPort?: number;
  /** HTTP REST API port. Default: 9471 */
  httpPort?: number;
  /** Host to bind to. Default: 0.0.0.0 */
  host?: string;
  /** CORS origin for HTTP API. Default: * */
  corsOrigin?: string;
}

export interface CollectorServer {
  wsServer: FastifyInstance;
  httpServer: FastifyInstance;
  router: EventRouter;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Create and configure the collector server instances.
 * Call `.start()` to begin listening.
 */
export function createCollectorServer(config: CollectorServerConfig = {}): CollectorServer {
  const wsPort = config.wsPort ?? 9470;
  const httpPort = config.httpPort ?? 9471;
  const host = config.host ?? '0.0.0.0';
  const corsOrigin = config.corsOrigin ?? '*';

  const router = new EventRouter({
    ringBufferCapacity: config.ringBufferCapacity,
    checkpointDbPath: config.checkpointDbPath,
    otelEndpoint: config.otelEndpoint,
    otelEnabled: config.otelEnabled,
  });

  // ── WebSocket Server (port 9470) ─────────────────────────────

  const wsServer = Fastify({ logger: { level: 'info' } });

  const wsSetupPromise = (async () => {
    await wsServer.register(fastifyWebSocket);
    await wsServer.register(fastifyCors, { origin: corsOrigin });

    // Health endpoint on WS server too
    wsServer.get('/health', async () => ({
      status: 'ok',
      service: 'sutures-collector-ws',
      adapters: router.adapterClients.size,
      dashboards: router.dashboardClients.size,
      events: router.ringBuffer.size,
      timestamp: new Date().toISOString(),
    }));

    // Main WebSocket route for adapters
    wsServer.get('/v1/events', { websocket: true }, (socket) => {
      handleAdapterConnection(socket, router);
    });

    // WebSocket route for dashboard clients
    wsServer.get('/v1/dashboard', { websocket: true }, (socket) => {
      handleDashboardConnection(socket, router);
    });
  })();

  // ── HTTP REST Server (port 9471) ─────────────────────────────

  const httpServer = Fastify({ logger: { level: 'info' } });

  const httpSetupPromise = (async () => {
    await httpServer.register(fastifyCors, { origin: corsOrigin });

    httpServer.get('/health', async () => ({
      status: 'ok',
      service: 'sutures-collector',
      adapters: router.adapterClients.size,
      dashboards: router.dashboardClients.size,
      events: router.ringBuffer.size,
      breakpoints: router.breakpointController.getAll().length,
      timestamp: new Date().toISOString(),
    }));

    httpServer.get('/api/topology', async (request) => {
      const query = request.query as Record<string, string>;
      const swarmId = query['swarm_id'];
      if (swarmId) {
        return { topology: router.getTopology(swarmId) ?? null };
      }
      const all: Record<string, unknown> = {};
      for (const [id, topo] of router.getAllTopologies()) {
        all[id] = topo;
      }
      return { topologies: all };
    });

    httpServer.get('/api/events', async (request) => {
      const query = request.query as Record<string, string>;
      const swarmId = query['swarm_id'];
      const agentId = query['agent_id'];
      const limit = parseInt(query['limit'] ?? '100', 10);

      if (swarmId) {
        const events = router.ringBuffer.getBySwarmId(swarmId);
        return { events: events.slice(-limit) };
      }
      if (agentId) {
        const events = router.ringBuffer.getByAgentId(agentId);
        return { events: events.slice(-limit) };
      }
      return { events: router.ringBuffer.getRecent(limit) };
    });

    httpServer.get('/api/checkpoints', async (request) => {
      const query = request.query as Record<string, string>;
      const threadId = query['thread_id'];
      if (!threadId) {
        return { error: 'thread_id query parameter required' };
      }
      const checkpoints = router.checkpointStore.getByThreadId(threadId);
      return { checkpoints };
    });

    httpServer.get('/api/breakpoints', async () => {
      return { breakpoints: router.breakpointController.getAll() };
    });
  })();

  return {
    wsServer,
    httpServer,
    router,

    async start() {
      await wsSetupPromise;
      await httpSetupPromise;
      await wsServer.listen({ port: wsPort, host });
      await httpServer.listen({ port: httpPort, host });
      console.log(`[Collector] WebSocket server listening on ws://${host}:${wsPort}`);
      console.log(`[Collector] HTTP API server listening on http://${host}:${httpPort}`);
    },

    async stop() {
      console.log('[Collector] Shutting down...');
      await router.shutdown();
      await wsServer.close();
      await httpServer.close();
      console.log('[Collector] Stopped.');
    },
  };
}

// ── WebSocket Connection Handlers ──────────────────────────────

function handleAdapterConnection(socket: WebSocket, router: EventRouter): void {
  router.adapterClients.add(socket);
  console.log(`[Collector] Adapter connected (total: ${router.adapterClients.size})`);

  socket.on('message', (data) => {
    try {
      const raw = typeof data === 'string' ? data : data.toString('utf-8');
      router.handleMessage(socket, raw, 'adapter');
    } catch (err) {
      console.error('[Collector] Error handling adapter message:', err);
    }
  });

  socket.on('close', () => {
    router.adapterClients.delete(socket);
    console.log(`[Collector] Adapter disconnected (total: ${router.adapterClients.size})`);
  });

  socket.on('error', (err) => {
    console.error('[Collector] Adapter WebSocket error:', err);
    router.adapterClients.delete(socket);
  });
}

function handleDashboardConnection(socket: WebSocket, router: EventRouter): void {
  router.dashboardClients.add(socket);
  console.log(`[Collector] Dashboard connected (total: ${router.dashboardClients.size})`);

  // Send current topologies on connect
  for (const [, topology] of router.getAllTopologies()) {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify({ type: 'topology', payload: topology }));
    }
  }

  socket.on('message', (data) => {
    try {
      const raw = typeof data === 'string' ? data : data.toString('utf-8');
      router.handleMessage(socket, raw, 'dashboard');
    } catch (err) {
      console.error('[Collector] Error handling dashboard message:', err);
    }
  });

  socket.on('close', () => {
    router.dashboardClients.delete(socket);
    console.log(`[Collector] Dashboard disconnected (total: ${router.dashboardClients.size})`);
  });

  socket.on('error', (err) => {
    console.error('[Collector] Dashboard WebSocket error:', err);
    router.dashboardClients.delete(socket);
  });
}
