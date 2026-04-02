# sutures-plugin-hello

Example Sutures plugin demonstrating the plugin system. Adds:

- **MCP Tool**: `hello_world` — greets the swarm (verifies plugin tools work)
- **Command**: `hello_ping` — responds with pong (verifies plugin commands work)
- **Anomaly Detector**: `slow_turn` — flags turns taking >30s

## Usage

```js
// sutures.config.js
export default {
  plugins: ['./examples/sutures-plugin-hello']
}
```

Or install as an npm package and it will be auto-discovered.

## Creating Your Own Plugin

1. Create a package named `sutures-plugin-*`
2. Default-export a `SuturesPlugin` object:

```js
export default {
  name: 'my-plugin',
  version: '1.0.0',
  tools: [...],       // MCP tools
  commands: [...],    // Collector commands
  anomalyDetectors: [...],  // Custom anomaly detection
  onLoad() { ... },
  onUnload() { ... },
}
```

3. Install it or add to `sutures.config.js`

See `@sutures/core` for full type definitions (`SuturesPlugin`, `ToolDefinition`, etc.).
