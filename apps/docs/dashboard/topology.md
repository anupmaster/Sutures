# Topology Canvas

The Topology Canvas is the central panel of the Sutures dashboard. It renders a live, interactive graph of your agent swarm using React Flow with automatic ELK layout.

## Agent Nodes

Each agent appears as a node on the canvas with:

- **Name** and **role** label
- **Status indicator** with color-coded ring (idle=gray, thinking=amber, acting=blue, paused=red, completed=emerald)
- **Model** badge (e.g., "claude-sonnet-4-20250514")
- **Turn counter** showing current turn number
- **Breakpoint indicator** — red dot when a breakpoint is set on the agent
- **Cost badge** showing cumulative cost

### Node Interactions

- **Click** a node to select it and open the Agent Inspector
- **Right-click** for context menu (set breakpoint, pause, resume, view memory)
- **Hover** to see a tooltip with agent details
- **Double-click** to focus/zoom on the agent

## Handoff Edges

Edges represent handoffs and delegations between agents:

- **Handoff edges** — Solid lines with directional arrows
- **Delegation edges** — Dashed lines
- **Animated edges** — Edges animate when a handoff is in progress
- **Labels** — Show the handoff reason on hover

## Auto Layout (ELK)

The topology uses ELK.js for automatic graph layout:

- Agents are positioned hierarchically based on parent-child relationships
- Handoff edges route cleanly between nodes
- Layout recalculates when agents are added or handoffs occur
- Layout is **throttled** — it does not recalculate on every event, only on structural changes

## Live Updates

The canvas updates in real-time as events arrive:

| Event | Canvas Update |
|---|---|
| `agent.spawned` | New node appears |
| `agent.completed` / `agent.failed` | Node ring changes to completed (green) or failed (red) |
| `agent.paused` | Node ring turns red, pause icon appears |
| `turn.thinking` | Node ring pulses amber |
| `turn.acting` | Node ring pulses blue |
| `handoff.initiated` | New edge appears with animation |
| `breakpoint.set` | Red breakpoint dot appears on node |
| `breakpoint.hit` | Node ring turns red, pulse animation |

## G-Memory Overlay

Toggle the G-Memory overlay to see the graph-based memory structure rendered on top of the topology:

- **Insight nodes** (diamond shaped) — Key findings
- **Query nodes** (circle shaped) — Questions
- **Interaction nodes** (square shaped) — Agent-to-agent exchanges
- **Edges** connect related memory nodes

The overlay is automatically disabled in **lite mode** (>20 agents) to maintain 60fps performance.

## Controls

- **Zoom** — Scroll wheel or pinch
- **Pan** — Click and drag on canvas background
- **Fit View** — Button to fit all nodes in view
- **Minimap** — Toggle minimap for large swarms
- **Layout** — Re-run ELK layout manually
- **Lite Mode** — Toggle simplified rendering for large swarms
