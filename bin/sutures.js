#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const args = process.argv.slice(2);
const flags = args.filter(a => a.startsWith('--'));
const positional = args.filter(a => !a.startsWith('--'));
const command = positional[0] || 'start';
const demoMode = flags.includes('--demo');

const BANNER = `
  ╔═══════════════════════════════════════╗
  ║          S U T U R E S               ║
  ║     Breakpoints for AI Agents        ║
  ╚═══════════════════════════════════════╝
`;

const PORTS = {
  ws: process.env.SUTURES_WS_PORT || '9470',
  http: process.env.SUTURES_HTTP_PORT || '9471',
  ui: process.env.SUTURES_UI_PORT || '9472',
};

function run(cmd, cwd, env = {}, stdio = 'inherit') {
  return spawn(cmd, { shell: true, cwd, stdio, env: { ...process.env, ...env } });
}

function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
  spawn(cmd, [url], { shell: true, stdio: 'ignore', detached: true }).unref();
}

async function waitForServer(url, maxAttempts = 20) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {}
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

async function runSimulator() {
  console.log('\n  Running demo simulation (3-agent research swarm)...\n');
  setTimeout(async () => {
    try {
      const res = await fetch(`http://localhost:${PORTS?.http ?? 9471}/api/simulate`, { method: 'POST' });
      if (res.ok) console.log('[sutures] Demo simulation started');
      else console.error('[sutures] Failed to start demo:', res.statusText);
    } catch (e) {
      console.error('[sutures] Failed to reach collector for demo:', e.message);
    }
  }, 3000);
}

function printHelp() {
  console.log(BANNER);
  console.log('Usage: sutures [command]\n');
  console.log('Commands:');
  console.log('  start         Start collector + dashboard + open browser (default)');
  console.log('  start --demo  Start everything + run demo simulation');
  console.log('  collector     Start collector server only');
  console.log('  dashboard     Start dashboard UI only');
  console.log('  mcp           Start MCP server (stdio)');
  console.log('  version       Show version');
  console.log('  help          Show this help\n');
  console.log('Ports:');
  console.log(`  WebSocket:  ${PORTS.ws}`);
  console.log(`  HTTP API:   ${PORTS.http}`);
  console.log(`  Dashboard:  ${PORTS.ui}\n`);
  console.log('Environment:');
  console.log('  SUTURES_WS_PORT       WebSocket port (default: 9470)');
  console.log('  SUTURES_HTTP_PORT     HTTP API port (default: 9471)');
  console.log('  SUTURES_UI_PORT       Dashboard port (default: 9472)');
  console.log('  SUTURES_CHECKPOINT_DB SQLite path (default: sutures_checkpoints.db)');
  console.log('  SUTURES_OTEL_ENABLED  Enable OTEL export (default: false)');
}

async function startCollector() {
  console.log(`  Collector starting on ws://localhost:${PORTS.ws} | http://localhost:${PORTS.http}`);
  return run('node dist/index.js', resolve(root, 'packages/collector'), {
    SUTURES_WS_PORT: PORTS.ws,
    SUTURES_HTTP_PORT: PORTS.http,
  });
}

async function startDashboard() {
  console.log(`  Dashboard starting on http://localhost:${PORTS.ui}`);
  return run(`npx next start -p ${PORTS.ui}`, resolve(root, 'apps/dashboard'));
}

async function startMcp() {
  return run('node dist/index.js', resolve(root, 'packages/mcp-server'));
}

const processes = [];

function cleanup() {
  for (const p of processes) {
    if (!p.killed) p.kill('SIGTERM');
  }
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

switch (command) {
  case 'start': {
    console.log(BANNER);
    const collector = await startCollector();
    processes.push(collector);

    // Wait for collector to be ready
    const collectorReady = await waitForServer(`http://localhost:${PORTS.http}/health`);
    if (!collectorReady) {
      console.error('  ✗ Collector failed to start');
      cleanup();
      break;
    }
    console.log('  ✓ Collector ready');

    const dashboard = await startDashboard();
    processes.push(dashboard);

    // Wait for dashboard to be ready, then open browser
    const dashReady = await waitForServer(`http://localhost:${PORTS.ui}`);
    if (dashReady) {
      console.log('  ✓ Dashboard ready');
      console.log(`\n  Opening http://localhost:${PORTS.ui} ...\n`);
      openBrowser(`http://localhost:${PORTS.ui}`);
    }

    // If --demo flag, run the simulator after a brief pause
    if (demoMode) {
      await new Promise(r => setTimeout(r, 1000));
      const sim = await runSimulator();
      processes.push(sim);
    }
    break;
  }
  case 'collector': {
    console.log(BANNER);
    const p = await startCollector();
    processes.push(p);
    break;
  }
  case 'dashboard': {
    console.log(BANNER);
    const p = await startDashboard();
    processes.push(p);
    break;
  }
  case 'mcp': {
    const p = await startMcp();
    processes.push(p);
    break;
  }
  case 'version': {
    console.log('sutures v0.1.0-alpha');
    process.exit(0);
  }
  case 'help':
  case '--help':
  case '-h': {
    printHelp();
    process.exit(0);
  }
  default: {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }
}
