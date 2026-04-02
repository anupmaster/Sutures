/**
 * Tree data provider for the Agent Explorer sidebar view.
 *
 * Hierarchy: Swarm > Agent nodes with status icons.
 */

import * as vscode from 'vscode';
import type { CollectorClient, TopologyAgent, AgentStatus } from './collector';

// ── Tree item types ──────────────────────────────────────────────

type TreeItemType = SwarmItem | AgentItem | DisconnectedItem;

class SwarmItem extends vscode.TreeItem {
  constructor(
    public readonly swarmId: string,
    agentCount: number
  ) {
    super(`Swarm: ${swarmId}`, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = 'swarm';
    this.description = `${agentCount} agent${agentCount !== 1 ? 's' : ''}`;
    this.iconPath = new vscode.ThemeIcon('symbol-namespace');
  }
}

class AgentItem extends vscode.TreeItem {
  constructor(
    public readonly agentId: string,
    public readonly swarmId: string,
    public readonly agent: TopologyAgent & { swarm_id: string }
  ) {
    super(agent.name ?? agentId, vscode.TreeItemCollapsibleState.None);
    this.contextValue = 'agent';
    this.description = `${agent.status}${agent.model ? ` - ${agent.model}` : ''}`;
    this.iconPath = AgentItem.getStatusIcon(agent.status);
    this.tooltip = AgentItem.getTooltip(agent);
    this.command = {
      command: 'sutures.inspectAgent',
      title: 'Inspect Agent',
      arguments: [agentId, swarmId],
    };
  }

  private static getStatusIcon(
    status: AgentStatus
  ): vscode.ThemeIcon {
    const iconMap: Record<AgentStatus, { id: string; color: string }> = {
      spawned: { id: 'circle-outline', color: 'charts.gray' },
      idle: { id: 'circle-filled', color: 'charts.gray' },
      thinking: { id: 'loading~spin', color: 'charts.yellow' },
      acting: { id: 'zap', color: 'charts.blue' },
      observing: { id: 'eye', color: 'charts.blue' },
      completed: { id: 'pass-filled', color: 'charts.green' },
      failed: { id: 'error', color: 'charts.red' },
      paused: { id: 'debug-pause', color: 'charts.red' },
    };

    const mapped = iconMap[status] ?? iconMap.idle;
    return new vscode.ThemeIcon(
      mapped.id,
      new vscode.ThemeColor(mapped.color)
    );
  }

  private static getTooltip(
    agent: TopologyAgent & { swarm_id: string }
  ): string {
    const lines = [
      `Agent: ${agent.name ?? agent.agent_id}`,
      `ID: ${agent.agent_id}`,
      `Status: ${agent.status}`,
      `Swarm: ${agent.swarm_id}`,
    ];
    if (agent.model) lines.push(`Model: ${agent.model}`);
    if (agent.spawned_at) lines.push(`Spawned: ${agent.spawned_at}`);
    if (agent.completed_at) lines.push(`Completed: ${agent.completed_at}`);
    return lines.join('\n');
  }
}

class DisconnectedItem extends vscode.TreeItem {
  constructor() {
    super('Not connected', vscode.TreeItemCollapsibleState.None);
    this.description = 'Click to connect';
    this.iconPath = new vscode.ThemeIcon(
      'debug-disconnect',
      new vscode.ThemeColor('charts.red')
    );
    this.command = {
      command: 'sutures.connect',
      title: 'Connect',
    };
  }
}

// ── Provider ─────────────────────────────────────────────────────

export class AgentTreeProvider
  implements vscode.TreeDataProvider<TreeItemType>
{
  private _onDidChangeTreeData = new vscode.EventEmitter<
    TreeItemType | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private client: CollectorClient) {}

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: TreeItemType): vscode.TreeItem {
    return element;
  }

  getChildren(element?: TreeItemType): TreeItemType[] {
    if (!this.client.connected) {
      return [new DisconnectedItem()];
    }

    // Root level: show swarms
    if (!element) {
      const swarmIds = new Set<string>();
      for (const agent of this.client.agents.values()) {
        swarmIds.add(agent.swarm_id);
      }

      if (swarmIds.size === 0) {
        const empty = new vscode.TreeItem(
          'No agents yet',
          vscode.TreeItemCollapsibleState.None
        );
        empty.description = 'Run a swarm or start a simulation';
        empty.iconPath = new vscode.ThemeIcon('info');
        return [empty as TreeItemType];
      }

      return Array.from(swarmIds).map((swarmId) => {
        const count = Array.from(this.client.agents.values()).filter(
          (a) => a.swarm_id === swarmId
        ).length;
        return new SwarmItem(swarmId, count);
      });
    }

    // Swarm children: agents in that swarm
    if (element instanceof SwarmItem) {
      const agents: AgentItem[] = [];
      for (const agent of this.client.agents.values()) {
        if (agent.swarm_id === element.swarmId) {
          agents.push(
            new AgentItem(agent.agent_id, element.swarmId, agent)
          );
        }
      }
      // Sort: active first, then by name
      agents.sort((a, b) => {
        const statusOrder: Record<AgentStatus, number> = {
          paused: 0,
          acting: 1,
          thinking: 2,
          observing: 3,
          idle: 4,
          spawned: 5,
          completed: 6,
          failed: 7,
        };
        const oa = statusOrder[a.agent.status] ?? 5;
        const ob = statusOrder[b.agent.status] ?? 5;
        if (oa !== ob) return oa - ob;
        return a.agentId.localeCompare(b.agentId);
      });
      return agents;
    }

    return [];
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
