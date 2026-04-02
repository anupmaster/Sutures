/**
 * Status bar management — shows connection status and agent counts.
 */

import * as vscode from 'vscode';

export class SuturesStatusBar {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    this.item.command = 'sutures.connect';
    this.setDisconnected();
    this.item.show();
  }

  setConnected(agentCount: number, activeCount: number): void {
    this.item.text = `$(plug) Sutures: ${agentCount} agent${agentCount !== 1 ? 's' : ''} (${activeCount} active)`;
    this.item.tooltip = 'Connected to Sutures collector. Click to disconnect.';
    this.item.command = 'sutures.disconnect';
    this.item.backgroundColor = undefined;
  }

  setDisconnected(): void {
    this.item.text = '$(debug-disconnect) Sutures: disconnected';
    this.item.tooltip = 'Click to connect to Sutures collector';
    this.item.command = 'sutures.connect';
    this.item.backgroundColor = new vscode.ThemeColor(
      'statusBarItem.warningBackground'
    );
  }

  setConnecting(): void {
    this.item.text = '$(sync~spin) Sutures: connecting...';
    this.item.tooltip = 'Connecting to Sutures collector...';
    this.item.command = undefined;
    this.item.backgroundColor = undefined;
  }

  update(agentCount: number, activeCount: number): void {
    this.setConnected(agentCount, activeCount);
  }

  dispose(): void {
    this.item.dispose();
  }
}
