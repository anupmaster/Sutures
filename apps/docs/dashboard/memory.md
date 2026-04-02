# Memory Debugger

The Memory Debugger panel provides deep visibility into how agents store, share, and manage information. Access it via the "Memory" tab in the right sidebar.

## Three-Tier Hierarchy View

The hierarchy view shows each agent's memory organized by tier:

| Tier | Display | Description |
|---|---|---|
| **STM** | Green badges | Active working memory — current task context |
| **MTM** | Amber badges | Session memory — frequently accessed items |
| **LTM** | Purple badges | Persistent memory — consolidated knowledge |

Each memory entry shows:
- Key name
- Value preview (truncated)
- Token size
- Access count (heat indicator)
- Shared/private indicator

Arrows between tiers show migration direction (promotion up, eviction down).

## Context Pressure Bar

A horizontal bar for each agent showing context window utilization:

| Range | Color | Meaning |
|---|---|---|
| 0-60% | Green `#10B981` | Safe operating range |
| 60-85% | Amber `#F59E0B` | Approaching capacity |
| 85-100% | Red `#EF4444` | Context cliff — quality will degrade |

The pressure bar updates in real-time as token counts change. Set `on_context_pressure` breakpoints at 85% to intervene before quality degrades.

## Shared Memory Map

A graph visualization showing how agents share memory:

- **Agent nodes** — Circles colored by agent
- **Memory key nodes** — Rectangles
- **Write edges** — Solid arrows from agent to key (who wrote it)
- **Read edges** — Dashed arrows from key to agent (who reads it)
- **Stale indicators** — Red edges when a reader has an outdated version

The map updates live as `memory.write`, `memory.read`, and `memory.coherence_violation` events arrive.

## Migration Timeline

A mini-timeline showing memory tier migrations:

```
research_results:  STM ──→ MTM ──→ (still MTM)
g_memory_notes:    STM ──→ ──→ ──→ LTM
report_outline:    STM (current)
```

Each migration is triggered by a `memory.tier_migration` event and shows the reason (e.g., "Accessed 3+ times", "Core research finding").

## Pruning Heatmap

A grid showing memory temperature for each agent:

- **Hot** (red) — Frequently accessed, will be kept
- **Warm** (amber) — Moderate access, might be pruned under pressure
- **Cold** (blue) — Rarely accessed, prime candidates for pruning

Use `simulate_prune` (MCP tool) to preview what would be lost before it happens.

## Memory Event Feed

A live feed of memory events filtered to the selected agent or swarm:

- `memory.write` — New data stored
- `memory.read` — Data accessed
- `memory.tier_migration` — Data promoted/demoted
- `memory.conflict` — Contradictory data detected
- `memory.prune` — Data removed
- `memory.reconsolidate` — Data updated with new evidence
- `memory.structure_switch` — Memory organization changed
- `memory.coherence_violation` — Stale shared data detected

Each event shows a timestamp, the key affected, and relevant details.

## Structure Selector

For agents using FluxMem-style dynamic memory, the structure selector shows:

- Current memory organization (linear / graph / hybrid)
- Confidence percentage
- Switch history

This corresponds to `memory.structure_switch` events.
