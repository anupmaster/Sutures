# Timeline

The Timeline panel displays a swim-lane visualization of all events across agents, providing a chronological view of your swarm's execution.

## Layout

The timeline uses horizontal swim lanes, one per agent:

```
Time →
┌─────────────────────────────────────────────────────┐
│ Researcher  ●──●──●──●──●──●──◆─────────────────●  │
│ Critic      ──────────────────────●──●──●──◆─────●  │
│ Writer      ──────────────────────────────────●──●  │
└─────────────────────────────────────────────────────┘
```

- Each **dot** represents an event
- **Diamonds** (◆) represent handoff points
- **Red dots** represent breakpoint hits
- **Fork markers** show where execution was forked

## Event Markers

| Symbol | Event Type |
|---|---|
| Green dot | Lifecycle events (spawn, complete) |
| Amber dot | Thinking events |
| Blue dot | Acting/tool events |
| Gray dot | Observation/idle events |
| Red dot | Error or breakpoint hit |
| Diamond | Handoff (initiated/accepted) |
| Branch marker | Fork from checkpoint |

## Interactions

- **Hover** on any marker to see event details in a tooltip
- **Click** a marker to select the event and show it in the inspector
- **Drag** to pan the timeline horizontally
- **Scroll** to zoom in/out on the time axis
- **Click an agent label** to select that agent in the topology

## Fork Visualization

When a fork occurs, the timeline shows a branching point:

```
Time →
┌──────────────────────────────────────────────┐
│ Researcher  ●──●──●──┬──●──●──●              │
│                       └──●──●──● (fork)      │
│ Critic      ──────────────●──●──●            │
└──────────────────────────────────────────────┘
```

You can switch between branches to compare the execution path of the original and forked runs.

## Filtering

- **By agent** — Click agent labels to show/hide swim lanes
- **By event type** — Filter to show only lifecycle, reasoning, handoff, memory, or intervention events
- **By severity** — Filter by debug/info/warn/error/critical
- **Time range** — Select a time range to focus on

## Synchronization

The timeline stays synchronized with the topology canvas:

- Selecting an event on the timeline highlights the corresponding agent in the topology
- Selecting an agent in the topology scrolls the timeline to show that agent's recent events
- Breakpoint hits flash on both the timeline and the topology simultaneously
