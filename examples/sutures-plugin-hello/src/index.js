/**
 * sutures-plugin-hello — Example Sutures plugin
 *
 * Demonstrates how to create a plugin that adds:
 * - A custom MCP tool
 * - A custom collector command
 * - A custom anomaly detector
 *
 * Install: npm install sutures-plugin-hello
 * Or add to sutures.config.js:
 *   export default { plugins: ['./examples/sutures-plugin-hello'] }
 */

/** @type {import('@sutures/core').SuturesPlugin} */
const plugin = {
  name: 'hello',
  version: '0.1.0',

  // Custom MCP tool — available in Claude Code / Cursor
  tools: [
    {
      name: 'hello_world',
      description: 'A demo tool that greets the swarm. Use this to verify the plugin system works.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Name to greet. Default: "World".' },
        },
      },
      handler(args) {
        const name = args.name || 'World';
        return {
          content: [{ type: 'text', text: `Hello, ${name}! The Sutures plugin system is working.` }],
        };
      },
    },
  ],

  // Custom collector command — callable from dashboard
  commands: [
    {
      name: 'hello_ping',
      handler(payload, ctx) {
        ctx.sendResponse('hello_ping', {
          message: 'pong from sutures-plugin-hello!',
          timestamp: new Date().toISOString(),
        });
      },
    },
  ],

  // Custom anomaly detector — runs on every event
  anomalyDetectors: [
    {
      name: 'slow_turn',
      /** Flag turns that take longer than 30 seconds. */
      evaluate(event) {
        if (event.event_type !== 'turn.completed') return [];
        const durationMs = event.data?.duration_ms;
        if (typeof durationMs !== 'number' || durationMs < 30_000) return [];

        return [{
          type: 'slow_turn',
          agent_id: event.agent_id,
          swarm_id: event.swarm_id,
          message: `Agent "${event.agent_id}" turn took ${(durationMs / 1000).toFixed(1)}s (>30s threshold)`,
          severity: 'warn',
          detected_at: new Date().toISOString(),
          details: { duration_ms: durationMs },
        }];
      },
    },
  ],

  onLoad() {
    console.log('[sutures-plugin-hello] Plugin loaded!');
  },

  onUnload() {
    console.log('[sutures-plugin-hello] Plugin unloaded.');
  },
};

export default plugin;
