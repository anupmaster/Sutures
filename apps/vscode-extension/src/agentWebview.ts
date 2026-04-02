/**
 * Agent Inspector webview panel — shows agent details, events, tool calls.
 */

import * as vscode from 'vscode';
import type { CollectorClient, AgentEvent, TopologyAgent, AgentStatus } from './collector';

const STATUS_COLORS: Record<AgentStatus, string> = {
  spawned: '#6B7280',
  idle: '#6B7280',
  thinking: '#F59E0B',
  acting: '#3B82F6',
  observing: '#3B82F6',
  completed: '#10B981',
  failed: '#EF4444',
  paused: '#EF4444',
};

export class AgentWebviewManager {
  private panels = new Map<string, vscode.WebviewPanel>();

  constructor(
    private client: CollectorClient,
    private extensionUri: vscode.Uri
  ) {}

  openAgent(agentId: string, _swarmId: string): void {
    // Reuse existing panel for this agent
    const existing = this.panels.get(agentId);
    if (existing) {
      existing.reveal(vscode.ViewColumn.One);
      this.updatePanel(agentId);
      return;
    }

    const agent = this.client.agents.get(agentId);
    const title = agent?.name ?? agentId;

    const panel = vscode.window.createWebviewPanel(
      'suturesAgent',
      `Agent: ${title}`,
      vscode.ViewColumn.One,
      {
        enableScripts: false,
        retainContextWhenHidden: true,
      }
    );

    panel.onDidDispose(() => {
      this.panels.delete(agentId);
    });

    this.panels.set(agentId, panel);
    this.updatePanel(agentId);
  }

  /** Refresh an open agent panel (called on new events) */
  refreshAgent(agentId: string): void {
    if (this.panels.has(agentId)) {
      this.updatePanel(agentId);
    }
  }

  /** Refresh all open panels */
  refreshAll(): void {
    for (const agentId of this.panels.keys()) {
      this.updatePanel(agentId);
    }
  }

  private updatePanel(agentId: string): void {
    const panel = this.panels.get(agentId);
    if (!panel) return;

    const agent = this.client.agents.get(agentId);
    const events = this.client.agentEvents.get(agentId) ?? [];

    panel.webview.html = this.buildHtml(agentId, agent, events);
  }

  private buildHtml(
    agentId: string,
    agent: (TopologyAgent & { swarm_id: string }) | undefined,
    events: AgentEvent[]
  ): string {
    const status = agent?.status ?? 'idle';
    const statusColor = STATUS_COLORS[status] ?? '#6B7280';
    const name = agent?.name ?? agentId;
    const model = agent?.model ?? 'Unknown';
    const swarmId = agent?.swarm_id ?? 'Unknown';

    // Group events by category
    const turnEvents = events.filter((e) => e.event_type.startsWith('turn.'));
    const toolCalls = events.filter(
      (e) => e.event_type === 'turn.acting' || e.event_type === 'turn.observed'
    );
    const memoryEvents = events.filter(
      (e) =>
        e.event_type.startsWith('memory.') ||
        e.event_type.startsWith('checkpoint.')
    );
    const costEvents = events.filter((e) =>
      e.event_type.startsWith('cost.')
    );

    // Compute total cost
    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    for (const ce of costEvents) {
      totalCost += (ce.data['cost_usd'] as number) ?? 0;
      totalInputTokens += (ce.data['input_tokens'] as number) ?? 0;
      totalOutputTokens += (ce.data['output_tokens'] as number) ?? 0;
    }

    // Get context messages (thinking events)
    const thinkingEvents = events.filter(
      (e) => e.event_type === 'turn.thinking' || e.event_type === 'turn.thought'
    );

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground, #F5F5F5);
      background: var(--vscode-editor-background, #1e1e1e);
      padding: 16px;
      line-height: 1.5;
    }
    h1 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    h2 {
      font-size: 14px;
      font-weight: 600;
      color: var(--vscode-foreground, #F5F5F5);
      margin: 20px 0 8px 0;
      padding-bottom: 4px;
      border-bottom: 1px solid var(--vscode-widget-border, #333);
    }
    .status-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 10px;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .meta-grid {
      display: grid;
      grid-template-columns: 100px 1fr;
      gap: 4px 12px;
      margin: 12px 0;
    }
    .meta-label {
      color: var(--vscode-descriptionForeground, #A1A1AA);
      font-size: 12px;
    }
    .meta-value {
      font-family: var(--vscode-editor-font-family, 'JetBrains Mono', monospace);
      font-size: 12px;
    }
    .stats-row {
      display: flex;
      gap: 16px;
      margin: 12px 0;
    }
    .stat-card {
      background: var(--vscode-editor-inactiveSelectionBackground, #222);
      border: 1px solid var(--vscode-widget-border, #333);
      border-radius: 6px;
      padding: 8px 12px;
      flex: 1;
      text-align: center;
    }
    .stat-value {
      font-size: 20px;
      font-weight: 700;
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .stat-label {
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #A1A1AA);
      margin-top: 2px;
    }
    .event-list {
      max-height: 300px;
      overflow-y: auto;
      border: 1px solid var(--vscode-widget-border, #333);
      border-radius: 6px;
    }
    .event-item {
      padding: 6px 10px;
      border-bottom: 1px solid var(--vscode-widget-border, #222);
      font-size: 12px;
      display: flex;
      align-items: baseline;
      gap: 8px;
    }
    .event-item:last-child { border-bottom: none; }
    .event-item:hover {
      background: var(--vscode-list-hoverBackground, #2a2d2e);
    }
    .event-type {
      font-family: var(--vscode-editor-font-family, monospace);
      font-weight: 600;
      min-width: 140px;
      flex-shrink: 0;
    }
    .event-time {
      color: var(--vscode-descriptionForeground, #71717A);
      font-size: 11px;
      min-width: 80px;
      flex-shrink: 0;
    }
    .event-detail {
      color: var(--vscode-descriptionForeground, #A1A1AA);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .thinking-block {
      background: var(--vscode-editor-inactiveSelectionBackground, #1a1a1d);
      border: 1px solid var(--vscode-widget-border, #333);
      border-left: 3px solid #F59E0B;
      border-radius: 4px;
      padding: 8px 12px;
      margin: 6px 0;
      font-size: 12px;
      font-family: var(--vscode-editor-font-family, monospace);
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 150px;
      overflow-y: auto;
    }
    .tool-card {
      background: var(--vscode-editor-inactiveSelectionBackground, #1a1a1d);
      border: 1px solid var(--vscode-widget-border, #333);
      border-left: 3px solid #3B82F6;
      border-radius: 4px;
      padding: 8px 12px;
      margin: 6px 0;
    }
    .tool-name {
      font-weight: 600;
      color: #3B82F6;
      font-family: var(--vscode-editor-font-family, monospace);
    }
    .tool-detail {
      font-size: 12px;
      color: var(--vscode-descriptionForeground, #A1A1AA);
      margin-top: 4px;
    }
    .empty {
      color: var(--vscode-descriptionForeground, #71717A);
      font-style: italic;
      padding: 12px;
      text-align: center;
    }
    .brand { color: #10B981; }
  </style>
</head>
<body>
  <h1>
    <span>${escapeHtml(name)}</span>
    <span class="status-badge" style="background: ${statusColor}22; color: ${statusColor}; border: 1px solid ${statusColor}44;">
      ${status}
    </span>
  </h1>

  <div class="meta-grid">
    <span class="meta-label">Agent ID</span>
    <span class="meta-value">${escapeHtml(agentId)}</span>
    <span class="meta-label">Swarm</span>
    <span class="meta-value">${escapeHtml(swarmId)}</span>
    <span class="meta-label">Model</span>
    <span class="meta-value">${escapeHtml(model)}</span>
    <span class="meta-label">Spawned</span>
    <span class="meta-value">${agent?.spawned_at ? formatTime(agent.spawned_at) : 'N/A'}</span>
  </div>

  <div class="stats-row">
    <div class="stat-card">
      <div class="stat-value brand">${events.length}</div>
      <div class="stat-label">Events</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color: #3B82F6">${toolCalls.filter((e) => e.event_type === 'turn.acting').length}</div>
      <div class="stat-label">Tool Calls</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color: #F59E0B">${formatTokens(totalInputTokens + totalOutputTokens)}</div>
      <div class="stat-label">Tokens</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color: ${totalCost > 0.1 ? '#EF4444' : '#10B981'}">$${totalCost.toFixed(3)}</div>
      <div class="stat-label">Cost</div>
    </div>
  </div>

  <h2>Context / Thinking</h2>
  ${
    thinkingEvents.length > 0
      ? thinkingEvents
          .slice(-5)
          .map(
            (e) =>
              `<div class="thinking-block">${escapeHtml(
                (e.data['content'] as string) ?? 'No content'
              )}</div>`
          )
          .join('')
      : '<div class="empty">No thinking events yet</div>'
  }

  <h2>Tool Calls</h2>
  ${
    toolCalls.length > 0
      ? buildToolCallsHtml(toolCalls)
      : '<div class="empty">No tool calls yet</div>'
  }

  <h2>Recent Events (${events.length})</h2>
  ${
    events.length > 0
      ? `<div class="event-list">${events
          .slice(-50)
          .reverse()
          .map(
            (e) =>
              `<div class="event-item">
                <span class="event-time">${formatTime(e.timestamp)}</span>
                <span class="event-type" style="color: ${getEventColor(e.event_type)}">${escapeHtml(e.event_type)}</span>
                <span class="event-detail">${escapeHtml(getEventSummary(e))}</span>
              </div>`
          )
          .join('')}</div>`
      : '<div class="empty">No events yet</div>'
  }

  <h2>Memory</h2>
  ${
    memoryEvents.length > 0
      ? `<div class="event-list">${memoryEvents
          .slice(-20)
          .reverse()
          .map(
            (e) =>
              `<div class="event-item">
                <span class="event-time">${formatTime(e.timestamp)}</span>
                <span class="event-type" style="color: ${getEventColor(e.event_type)}">${escapeHtml(e.event_type)}</span>
                <span class="event-detail">${escapeHtml(getEventSummary(e))}</span>
              </div>`
          )
          .join('')}</div>`
      : '<div class="empty">No memory events yet</div>'
  }
</body>
</html>`;
  }

  dispose(): void {
    for (const panel of this.panels.values()) {
      panel.dispose();
    }
    this.panels.clear();
  }
}

// ── Helpers ──────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatTokens(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}

function getEventColor(eventType: string): string {
  if (eventType.startsWith('turn.thinking') || eventType === 'turn.thought')
    return '#F59E0B';
  if (eventType.startsWith('turn.acting') || eventType === 'turn.observed')
    return '#3B82F6';
  if (eventType.startsWith('agent.')) return '#10B981';
  if (eventType.startsWith('handoff.')) return '#8B5CF6';
  if (eventType.startsWith('breakpoint.')) return '#EF4444';
  if (eventType.startsWith('memory.')) return '#10B981';
  if (eventType.startsWith('cost.')) return '#F59E0B';
  return '#A1A1AA';
}

function getEventSummary(event: AgentEvent): string {
  const d = event.data;
  switch (event.event_type) {
    case 'agent.spawned':
      return `${(d['name'] as string) ?? ''} (${(d['model'] as string) ?? ''})`;
    case 'turn.started':
      return `Turn ${d['turn_number'] ?? '?'}: ${(d['input'] as string)?.slice(0, 80) ?? ''}`;
    case 'turn.thinking':
    case 'turn.thought':
      return ((d['content'] as string) ?? '').slice(0, 100);
    case 'turn.acting':
      return `${d['tool_name'] ?? '?'}: ${(d['tool_input_summary'] as string) ?? ''}`;
    case 'turn.observed':
      return `${d['tool_name'] ?? '?'} -> ${((d['tool_output_summary'] as string) ?? '').slice(0, 80)}`;
    case 'turn.completed':
      return `Turn ${d['turn_number'] ?? '?'} done (${d['duration_ms'] ?? '?'}ms)`;
    case 'handoff.initiated':
      return `${d['source_agent_id']} -> ${d['target_agent_id']}: ${(d['reason'] as string) ?? ''}`;
    case 'handoff.accepted':
      return `${d['source_agent_id']} -> ${d['target_agent_id']}`;
    case 'cost.tokens':
      return `in:${d['input_tokens']} out:${d['output_tokens']} $${d['cost_usd'] ?? '?'}`;
    case 'memory.write':
      return `${d['key']}: ${((d['value'] as string) ?? '').slice(0, 60)}`;
    case 'memory.read':
      return `Read: ${d['key']}`;
    case 'memory.tier_migration':
      return `${d['key']}: ${d['from_tier']} -> ${d['to_tier']}`;
    case 'breakpoint.set':
      return `${d['condition']} on ${d['value'] ?? 'any'}`;
    case 'breakpoint.hit':
      return `Breakpoint hit!`;
    case 'breakpoint.release':
      return `Released`;
    case 'agent.completed':
      return `Total cost: $${d['total_cost_usd'] ?? '?'}`;
    case 'agent.failed':
      return (d['error'] as string) ?? 'Unknown error';
    default:
      return JSON.stringify(d).slice(0, 80);
  }
}

function buildToolCallsHtml(toolCalls: AgentEvent[]): string {
  // Pair acting + observed events
  const pairs: Array<{
    acting: AgentEvent;
    observed?: AgentEvent;
  }> = [];

  for (const event of toolCalls) {
    if (event.event_type === 'turn.acting') {
      pairs.push({ acting: event });
    } else if (event.event_type === 'turn.observed' && pairs.length > 0) {
      const last = pairs[pairs.length - 1];
      if (!last.observed) {
        last.observed = event;
      }
    }
  }

  return pairs
    .slice(-10)
    .reverse()
    .map((pair) => {
      const toolName = (pair.acting.data['tool_name'] as string) ?? 'unknown';
      const input =
        (pair.acting.data['tool_input_summary'] as string) ?? '';
      const output = pair.observed
        ? (pair.observed.data['tool_output_summary'] as string) ?? ''
        : 'Pending...';
      return `<div class="tool-card">
        <div class="tool-name">${escapeHtml(toolName)}</div>
        <div class="tool-detail"><strong>Input:</strong> ${escapeHtml(input)}</div>
        <div class="tool-detail"><strong>Output:</strong> ${escapeHtml(output)}</div>
      </div>`;
    })
    .join('');
}
