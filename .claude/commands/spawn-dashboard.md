# Spawn Dashboard Subagent

## Context
You are building the Sutures Dashboard — a Next.js 16 visual debugger for multi-agent systems with React Flow topology canvas, agent inspector, memory debugger, and breakpoint console.

## Pre-Read (MANDATORY)
- CLAUDE.md (Sections: Architecture, Tech Stack, UI Design Tokens, Memory Debugger)
- AGENT_EVENT_PROTOCOL.md (32 event types — these are what you render)

## Scope: apps/dashboard/

## Tech Stack
Next.js 16 (App Router), React Flow 12+, ELK.js, Zustand, Tailwind CSS v4, shadcn/ui, Recharts, Lucide React

## Deliverables

### Core Layout (4-panel resizable)
- TopBar: swarm selector, run controls, cost counter, connection status
- Left: TopologyCanvas (React Flow, 60% width)
- Right: AgentInspector (collapsible sidebar, 40% width)
- Bottom: Tabs [Timeline] [Breakpoints] [Cost] [Events]

### Topology Canvas (components/topology/)
- AgentNode.tsx: Custom React Flow node — status dot (color by state), model label, turn count, cost, progress bar, breakpoint indicator
- HandoffEdge.tsx: Animated dashed line (active), solid (completed), color by type
- TopologyCanvas.tsx: React Flow canvas with ELK.js auto-layout
- GMemoryOverlay.tsx: Toggle-able G-Memory graph overlay (P0.5)

### Inspector (components/inspector/)
- AgentInspector.tsx: Agent header + tabs
- ContextViewer.tsx: Scrollable message history with token annotations
- ToolCallLog.tsx: Table of tool calls (turn, tool, input, output, latency, success)
- MemoryDebugger.tsx: 3-tier hierarchy + context pressure bar + shared memory map

### State Management (hooks/ + stores/)
- useWebSocket.ts: WS connection to collector:9470, auto-reconnect, 50ms message batching
- useTopology.ts: AgentEvent → React Flow nodes/edges state machine
- stores/swarmStore.ts, eventStore.ts, memoryStore.ts, uiStore.ts (all Zustand)

### Performance Requirements
- 60fps with 30 agent nodes
- useMemo + useCallback on ALL node/edge components
- ELK layout throttled (not per-event)
- Dark theme only (tokens from CLAUDE.md)
- Cold start <2 seconds

## Acceptance Criteria
- [ ] Topology renders spawned agents in real-time from WS events
- [ ] Agent states update visually (idle/thinking/acting/paused/error)
- [ ] Click node → Inspector opens with agent details
- [ ] Breakpoint hit → agent node pulses red with PAUSED badge
- [ ] No jank at 30+ nodes with 50+ events/sec
