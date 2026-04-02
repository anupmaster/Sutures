/**
 * Plugin Loader — Discovers and loads Sutures plugins for the collector.
 * Supports auto-discovery of sutures-plugin-* packages and explicit config.
 */

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { EventRouter } from './eventRouter.js';

interface SuturesPlugin {
  name: string;
  version: string;
  commands?: Array<{ name: string; handler(payload: Record<string, unknown>, ctx: unknown): void | Promise<void> }>;
  anomalyDetectors?: Array<{ name: string; evaluate(event: unknown): unknown[]; clear?(): void }>;
  onLoad?(ctx: unknown): void | Promise<void>;
  onUnload?(): void | Promise<void>;
}

interface PluginEntry {
  name: string;
  options?: Record<string, unknown>;
}

/**
 * Discover sutures-plugin-* packages in node_modules.
 */
function discoverPlugins(basePath: string): string[] {
  const nodeModulesPath = join(basePath, 'node_modules');
  if (!existsSync(nodeModulesPath)) return [];

  const found: string[] = [];
  try {
    const entries = readdirSync(nodeModulesPath, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && entry.name.startsWith('sutures-plugin-')) {
        found.push(entry.name);
      }
      // Check scoped packages (@scope/sutures-plugin-*)
      if (entry.isDirectory() && entry.name.startsWith('@')) {
        try {
          const scopedEntries = readdirSync(join(nodeModulesPath, entry.name), { withFileTypes: true });
          for (const scoped of scopedEntries) {
            if (scoped.isDirectory() && scoped.name.startsWith('sutures-plugin-')) {
              found.push(`${entry.name}/${scoped.name}`);
            }
          }
        } catch { /* ignore */ }
      }
    }
  } catch { /* ignore */ }

  return found;
}

/**
 * Load a sutures.config.ts/js if it exists.
 */
function loadConfig(basePath: string): { plugins?: Array<string | [string, Record<string, unknown>]>; autoDiscover?: boolean } | null {
  const configPaths = [
    join(basePath, 'sutures.config.js'),
    join(basePath, 'sutures.config.mjs'),
  ];

  for (const configPath of configPaths) {
    if (existsSync(configPath)) {
      try {
        // Dynamic import for ESM config files
        // Note: we can't use top-level await, so this is synchronous fallback
        const raw = readFileSync(configPath, 'utf-8');
        // Simple JSON extraction for basic configs
        const match = raw.match(/plugins\s*:\s*\[([^\]]*)\]/);
        if (match) {
          const pluginNames = match[1]
            .split(',')
            .map(s => s.trim().replace(/['"]/g, ''))
            .filter(Boolean);
          return { plugins: pluginNames };
        }
      } catch { /* ignore */ }
    }
  }

  return null;
}

/**
 * Load all plugins and register them with the EventRouter.
 */
export async function loadPlugins(router: EventRouter, basePath?: string): Promise<string[]> {
  const base = basePath ?? process.cwd();
  const loaded: string[] = [];

  // 1. Read config
  const config = loadConfig(base);
  const autoDiscover = config?.autoDiscover ?? true;

  // 2. Collect plugin names
  const pluginEntries: PluginEntry[] = [];

  if (autoDiscover) {
    for (const name of discoverPlugins(base)) {
      pluginEntries.push({ name });
    }
  }

  if (config?.plugins) {
    for (const entry of config.plugins) {
      if (typeof entry === 'string') {
        pluginEntries.push({ name: entry });
      } else if (Array.isArray(entry)) {
        pluginEntries.push({ name: entry[0], options: entry[1] as Record<string, unknown> });
      }
    }
  }

  // 3. Deduplicate
  const seen = new Set<string>();
  const unique = pluginEntries.filter((e) => {
    if (seen.has(e.name)) return false;
    seen.add(e.name);
    return true;
  });

  // 4. Load each plugin
  for (const entry of unique) {
    try {
      let pluginModule: { default?: SuturesPlugin };

      // Try to resolve as a package or relative path
      const modulePath = entry.name.startsWith('.') ? resolve(base, entry.name) : entry.name;
      pluginModule = await import(modulePath);

      const plugin: SuturesPlugin = pluginModule.default ?? (pluginModule as unknown as SuturesPlugin);

      if (!plugin.name) {
        console.warn(`[Plugin] Skipping ${entry.name}: missing 'name' field`);
        continue;
      }

      // Register commands
      if (plugin.commands) {
        for (const cmd of plugin.commands) {
          router.commandRegistry.register(cmd);
        }
      }

      // Register anomaly detectors
      if (plugin.anomalyDetectors) {
        for (const detector of plugin.anomalyDetectors) {
          router.anomalyEngine.detectorRegistry.register(detector as Parameters<typeof router.anomalyEngine.detectorRegistry.register>[0]);
        }
      }

      // Call onLoad
      if (plugin.onLoad) {
        await plugin.onLoad({});
      }

      loaded.push(plugin.name);
      console.log(`[Plugin] Loaded: ${plugin.name}@${plugin.version}`);
    } catch (err) {
      console.warn(`[Plugin] Failed to load ${entry.name}:`, err instanceof Error ? err.message : err);
    }
  }

  return loaded;
}
