#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const args = process.argv.slice(2);
const command = args[0] || 'start';

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

function run(cmd, cwd, env = {}) {
  return spawn(cmd, { shell: true, cwd, stdio: 'inherit', env: { ...process.env, ...env } });
}

function printHelp() {
  console.log(BANNER);
  console.log('Usage: sutures [command]\n');
  console.log('Commands:');
  console.log('  start       Start collector + dashboard (default)');
  console.log('  collector   Start collector server only');
  console.log('  dashboard   Start dashboard UI only');
  console.log('  mcp         Start MCP server (stdio)');
  console.log('  version     Show version');
  console.log('  help        Show this help\n');
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
    // Give collector 2s to start before dashboard
    await new Promise(r => setTimeout(r, 2000));
    const dashboard = await startDashboard();
    processes.push(dashboard);
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
