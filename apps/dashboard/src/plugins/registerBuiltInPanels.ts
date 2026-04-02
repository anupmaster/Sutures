/**
 * Register all 8 built-in dashboard panels into the panelRegistry.
 * Called once at app initialization.
 */

import React from "react";
import {
  Brain,
  Bug,
  Clock,
  Crosshair,
  DollarSign,
  GitCompare,
  List,
  Syringe,
} from "lucide-react";
import { panelRegistry } from "./panelRegistry";

import { TimelinePanel } from "@/components/panels/TimelinePanel";
import { BreakpointPanel } from "@/components/panels/BreakpointPanel";
import { CostPanel } from "@/components/panels/CostPanel";
import { EventLog } from "@/components/panels/EventLog";
import { MemoryDebugger } from "@/components/panels/MemoryDebugger";
import { InjectionEditor } from "@/components/panels/InjectionEditor";
import { RootCausePanel } from "@/components/panels/RootCausePanel";
import { ComparatorPanel } from "@/components/panels/ComparatorPanel";

export function registerBuiltInPanels(): void {
  panelRegistry.register({
    id: "timeline",
    label: "Timeline",
    icon: React.createElement(Clock, { size: 13 }),
    component: TimelinePanel as React.ComponentType<{ onSendCommand?: (cmd: unknown) => void }>,
  });
  panelRegistry.register({
    id: "breakpoints",
    label: "Breakpoints",
    icon: React.createElement(Crosshair, { size: 13 }),
    component: BreakpointPanel as React.ComponentType<{ onSendCommand?: (cmd: unknown) => void }>,
  });
  panelRegistry.register({
    id: "inject",
    label: "Inject",
    icon: React.createElement(Syringe, { size: 13 }),
    component: InjectionEditor as React.ComponentType<{ onSendCommand?: (cmd: unknown) => void }>,
  });
  panelRegistry.register({
    id: "memory",
    label: "Memory",
    icon: React.createElement(Brain, { size: 13 }),
    component: MemoryDebugger as React.ComponentType<{ onSendCommand?: (cmd: unknown) => void }>,
  });
  panelRegistry.register({
    id: "cost",
    label: "Cost",
    icon: React.createElement(DollarSign, { size: 13 }),
    component: CostPanel as React.ComponentType<{ onSendCommand?: (cmd: unknown) => void }>,
  });
  panelRegistry.register({
    id: "rootcause",
    label: "Root Cause",
    icon: React.createElement(Bug, { size: 13 }),
    component: RootCausePanel as React.ComponentType<{ onSendCommand?: (cmd: unknown) => void }>,
  });
  panelRegistry.register({
    id: "comparator",
    label: "Comparator",
    icon: React.createElement(GitCompare, { size: 13 }),
    component: ComparatorPanel as React.ComponentType<{ onSendCommand?: (cmd: unknown) => void }>,
  });
  panelRegistry.register({
    id: "events",
    label: "Events",
    icon: React.createElement(List, { size: 13 }),
    component: EventLog as React.ComponentType<{ onSendCommand?: (cmd: unknown) => void }>,
  });
}
