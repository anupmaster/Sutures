# Dashboard Overview

The Sutures Dashboard is a real-time visual debugger for multi-agent systems. Built with Next.js 16, React Flow, and Tailwind CSS v4, it provides live topology visualization, agent inspection, memory debugging, timeline tracking, and cost monitoring — all updating via WebSocket.

## Accessing the Dashboard

```bash
npx sutures start
# Opens http://localhost:9472 automatically
```

Or start the dashboard independently:

```bash
npx sutures dashboard
# Dashboard on http://localhost:9472
# (Requires collector running on port 9470/9471)
```

## Layout

The dashboard is organized into panels:

| Panel | Location | Purpose |
|---|---|---|
| **Topology Canvas** | Center | React Flow graph showing agents and handoffs |
| **Agent Inspector** | Right sidebar | Detailed view of selected agent's state |
| **Timeline** | Bottom | Swim-lane event timeline with fork markers |
| **Memory Debugger** | Right sidebar (tab) | Memory hierarchy, pressure, shared map |
| **Cost Tracking** | Right sidebar (tab) | Cost breakdown by agent and model |
| **Diagnostics** | Right sidebar (tab) | Anomaly alerts and system health |

## Design System

The dashboard uses a dark-first design with the Sutures brand palette:

| Element | Color |
|---|---|
| Brand / Primary | `#10B981` (Emerald) |
| Background | `#0A0A0B` |
| Secondary surface | `#111113` |
| Elevated surface | `#1A1A1D` |
| Surface | `#222225` |
| Primary text | `#F5F5F5` |
| Secondary text | `#A1A1AA` |
| Muted text | `#71717A` |

### Agent State Colors

| State | Color |
|---|---|
| Idle | `#6B7280` (Gray) |
| Thinking | `#F59E0B` (Amber) |
| Acting | `#3B82F6` (Blue) |
| Paused | `#EF4444` (Red) |
| Completed | `#10B981` (Emerald) |

### Fonts

- **Display / Code**: JetBrains Mono
- **Body**: Inter

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Topology graph | React Flow 12+ |
| Auto-layout | ELK.js |
| State management | Zustand 5+ |
| Styling | Tailwind CSS v4 |
| UI primitives | shadcn/ui |
| Charts | Recharts 2+ |
| Icons | Lucide React |

## Performance

The dashboard is optimized for real-time updates with up to 30 agents:

- **WebSocket message batching** — 50ms collection window before render
- **Memoized components** — `useMemo` + `useCallback` on all node/edge components
- **Throttled layout** — ELK layout recalculation is throttled (not on every event)
- **Lite mode** — Automatically enabled for >20 agents, disables G-Memory overlay

Target: **60fps with 30 agents, <2s cold start, zero jank**.

## WebSocket Connection

The dashboard connects to `ws://localhost:9470/v1/dashboard` and receives:

- `event` messages — Live agent events
- `topology` messages — Updated swarm topology
- `anomaly` messages — Detected anomalies
- `session` messages — Collaborative session updates

On connect, the dashboard receives the current topology state and the last 500 events, so it is never empty even if opened after events have already arrived.
