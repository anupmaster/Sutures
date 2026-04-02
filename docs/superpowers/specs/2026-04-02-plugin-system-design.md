# Plugin System Design

**Date:** 2026-04-02
**Status:** Approved

## Summary

Replace hardcoded switch statements with dynamic registries. Enable third-party npm packages (`sutures-plugin-*`) to extend the dashboard, MCP server, collector, and anomaly engine.

## Plugin Interface

```typescript
interface SuturesPlugin {
  name: string;
  version: string;
  panels?: PanelDefinition[];
  tools?: ToolDefinition[];
  commands?: CommandDefinition[];
  anomalyDetectors?: DetectorDefinition[];
  onLoad?: (ctx: PluginContext) => void | Promise<void>;
  onUnload?: () => void | Promise<void>;
}
```

Each extension surface is optional. A plugin can provide any combination.

## Discovery

1. Auto-discover `sutures-plugin-*` packages in node_modules
2. Explicit list in `sutures.config.ts` (with per-plugin options)
3. Programmatic `registerPlugin()` API for runtime use

## Four Registries

| Registry | Location | Replaces |
|---|---|---|
| PanelRegistry | dashboard | BOTTOM_TABS array + switch in renderBottomPanel |
| ToolRegistry | mcp-server | TOOLS array + switch dispatch |
| CommandRegistry | collector | switch in handleDashboardCommand |
| DetectorRegistry | collector | hardcoded 4 anomaly types |

## Dashboard Panel Loading

- Built-in panels registered first, plugin panels appended to tab bar
- Lazy-loaded via React.lazy() wrapping plugin's dynamic import
- PluginProvider React context gives panels access to stores and sendCommand
- Per-plugin Zustand state via usePluginState(pluginName)

## Package Changes

No new packages. Plugin types in @sutures/core, registries in their respective packages:
- core/src/plugin.ts — types and interfaces
- collector/src/pluginLoader.ts, commandRegistry.ts, detectorRegistry.ts
- mcp-server/src/toolRegistry.ts
- dashboard/src/plugins/ — PluginProvider, panelRegistry, usePluginState

## Proof of Concept

- All 8 existing panels stay built-in (registered via same registry API)
- Example plugin in examples/sutures-plugin-hello that adds a panel + MCP tool
- Plugin authoring docs added to docs site
