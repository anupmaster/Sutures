/**
 * Sutures VS Code Extension — Breakpoints for AI Agents
 *
 * Provides a sidebar Agent Explorer, status bar, agent inspector webview,
 * and commands for connecting to the Sutures collector server.
 */

import * as vscode from 'vscode';
import { CollectorClient } from './collector';
import { AgentTreeProvider } from './agentTreeProvider';
import { AgentWebviewManager } from './agentWebview';
import { SuturesStatusBar } from './statusBar';

let client: CollectorClient;
let treeProvider: AgentTreeProvider;
let webviewManager: AgentWebviewManager;
let statusBar: SuturesStatusBar;
let refreshThrottle: ReturnType<typeof setTimeout> | null = null;

export function activate(context: vscode.ExtensionContext): void {
  console.log('[Sutures] Extension activating...');

  // ── Status bar ───────────────────────────────────────────────
  statusBar = new SuturesStatusBar();
  context.subscriptions.push({ dispose: () => statusBar.dispose() });

  // ── Collector client ─────────────────────────────────────────
  client = new CollectorClient({
    onConnected() {
      statusBar.setConnected(client.agentCount, client.activeAgentCount);
      scheduleRefresh();
      vscode.window.showInformationMessage('Sutures: Connected to collector.');
    },
    onDisconnected() {
      statusBar.setDisconnected();
      scheduleRefresh();
    },
    onError(error) {
      statusBar.setDisconnected();
      // Only show error when user explicitly tried to connect
      console.error('[Sutures] Connection error:', error);
    },
    onEvent(event) {
      statusBar.update(client.agentCount, client.activeAgentCount);
      webviewManager.refreshAgent(event.agent_id);
      scheduleRefresh();
    },
    onTopology(_topology) {
      statusBar.update(client.agentCount, client.activeAgentCount);
      scheduleRefresh();
    },
  });

  // ── Tree view ────────────────────────────────────────────────
  treeProvider = new AgentTreeProvider(client);
  const treeView = vscode.window.createTreeView('suturesAgentExplorer', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);
  context.subscriptions.push({ dispose: () => treeProvider.dispose() });

  // ── Webview manager ──────────────────────────────────────────
  webviewManager = new AgentWebviewManager(client, context.extensionUri);
  context.subscriptions.push({ dispose: () => webviewManager.dispose() });

  // ── Commands ─────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('sutures.connect', () => {
      statusBar.setConnecting();
      client.connect();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sutures.disconnect', () => {
      client.disconnect();
      client.reset();
      treeProvider.refresh();
      vscode.window.showInformationMessage(
        'Sutures: Disconnected from collector.'
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sutures.refreshExplorer', () => {
      treeProvider.refresh();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'sutures.inspectAgent',
      (agentId: string, swarmId: string) => {
        webviewManager.openAgent(agentId, swarmId);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sutures.setBreakpoint', async () => {
      if (!client.connected) {
        vscode.window.showWarningMessage(
          'Sutures: Connect to collector first.'
        );
        return;
      }

      const agents = Array.from(client.agents.values());
      if (agents.length === 0) {
        vscode.window.showWarningMessage(
          'Sutures: No agents available. Run a swarm first.'
        );
        return;
      }

      // Pick an agent
      const agentPick = await vscode.window.showQuickPick(
        agents.map((a) => ({
          label: a.name ?? a.agent_id,
          description: `${a.status} - ${a.agent_id}`,
          agentId: a.agent_id,
          swarmId: a.swarm_id,
        })),
        { placeHolder: 'Select an agent to set a breakpoint on' }
      );
      if (!agentPick) return;

      // Pick condition type
      const conditions = [
        { label: 'always', description: 'Break on every turn' },
        { label: 'on_tool', description: 'Break when a specific tool is called' },
        { label: 'on_handoff', description: 'Break on handoff' },
        { label: 'on_error', description: 'Break on any error' },
        { label: 'on_cost', description: 'Break when cost exceeds threshold' },
        { label: 'on_turn', description: 'Break on specific turn number' },
        { label: 'on_context_pressure', description: 'Break on high context usage' },
      ];

      const conditionPick = await vscode.window.showQuickPick(conditions, {
        placeHolder: 'Select breakpoint condition',
      });
      if (!conditionPick) return;

      // For conditions that need a value, prompt for it
      let value: unknown = undefined;
      if (conditionPick.label === 'on_tool') {
        value = await vscode.window.showInputBox({
          prompt: 'Tool name to break on',
          placeHolder: 'e.g., web_search',
        });
        if (!value) return;
      } else if (conditionPick.label === 'on_turn') {
        const turnStr = await vscode.window.showInputBox({
          prompt: 'Turn number to break on',
          placeHolder: 'e.g., 3',
        });
        if (!turnStr) return;
        value = parseInt(turnStr, 10);
      } else if (conditionPick.label === 'on_cost') {
        const costStr = await vscode.window.showInputBox({
          prompt: 'Cost threshold (USD)',
          placeHolder: 'e.g., 0.5',
        });
        if (!costStr) return;
        value = parseFloat(costStr);
      } else if (conditionPick.label === 'on_context_pressure') {
        const pctStr = await vscode.window.showInputBox({
          prompt: 'Context pressure percentage (0-100)',
          placeHolder: 'e.g., 85',
        });
        if (!pctStr) return;
        value = parseInt(pctStr, 10);
      }

      client.sendCommand('set_breakpoint', {
        agent_id: agentPick.agentId,
        swarm_id: agentPick.swarmId,
        condition: conditionPick.label,
        value,
      });

      vscode.window.showInformationMessage(
        `Sutures: Breakpoint set on "${agentPick.label}" (${conditionPick.label})`
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sutures.openDashboard', () => {
      const config = vscode.workspace.getConfiguration('sutures');
      const host = config.get<string>('collectorHost', 'localhost');
      const port = config.get<number>('dashboardPort', 9472);
      const url = `http://${host}:${port}`;
      vscode.env.openExternal(vscode.Uri.parse(url));
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sutures.startSimulation', async () => {
      const config = vscode.workspace.getConfiguration('sutures');
      const host = config.get<string>('collectorHost', 'localhost');
      const httpPort = config.get<number>('collectorHttpPort', 9471);

      try {
        // Use the collector's /api/simulate endpoint
        const url = `http://${host}:${httpPort}/api/simulate`;
        const response = await fetch(url, { method: 'POST' });
        if (response.ok) {
          vscode.window.showInformationMessage(
            'Sutures: Demo simulation started!'
          );
          // Auto-connect if not already connected
          if (!client.connected) {
            statusBar.setConnecting();
            client.connect();
          }
        } else {
          vscode.window.showErrorMessage(
            `Sutures: Failed to start simulation (HTTP ${response.status}). Is the collector running?`
          );
        }
      } catch {
        vscode.window.showErrorMessage(
          'Sutures: Cannot reach collector. Start it with: npx sutures'
        );
      }
    })
  );

  // ── Auto-connect ─────────────────────────────────────────────
  const config = vscode.workspace.getConfiguration('sutures');
  if (config.get<boolean>('autoConnect', true)) {
    // Small delay to let VS Code finish loading
    setTimeout(() => {
      client.connect();
    }, 1000);
  }

  console.log('[Sutures] Extension activated.');
}

export function deactivate(): void {
  console.log('[Sutures] Extension deactivating...');
  client?.disconnect();
}

// ── Helpers ──────────────────────────────────────────────────────

/** Throttled tree refresh — at most once per 100ms to batch rapid events */
function scheduleRefresh(): void {
  if (refreshThrottle) return;
  refreshThrottle = setTimeout(() => {
    refreshThrottle = null;
    treeProvider.refresh();
    webviewManager.refreshAll();
  }, 100);
}
