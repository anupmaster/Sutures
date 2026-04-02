/**
 * Panel Registry — Dynamic dashboard panel registration.
 * Replaces the hardcoded BOTTOM_TABS array + switch in page.tsx.
 */

import type React from "react";

export interface RegisteredPanel {
  id: string;
  label: string;
  icon: React.ReactNode;
  component: React.ComponentType<{ onSendCommand?: (cmd: unknown) => void }>;
}

class PanelRegistryImpl {
  private panels = new Map<string, RegisteredPanel>();
  private order: string[] = [];

  register(panel: RegisteredPanel): void {
    if (!this.panels.has(panel.id)) {
      this.order.push(panel.id);
    }
    this.panels.set(panel.id, panel);
  }

  unregister(id: string): boolean {
    this.order = this.order.filter((i) => i !== id);
    return this.panels.delete(id);
  }

  get(id: string): RegisteredPanel | undefined {
    return this.panels.get(id);
  }

  /** Return all panels in registration order. */
  all(): RegisteredPanel[] {
    return this.order.map((id) => this.panels.get(id)!).filter(Boolean);
  }

  ids(): string[] {
    return [...this.order];
  }
}

/** Singleton panel registry for the dashboard. */
export const panelRegistry = new PanelRegistryImpl();
