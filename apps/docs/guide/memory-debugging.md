# Memory Debugging

Memory is where most multi-agent systems break down. Sutures provides a comprehensive Memory Debugger that visualizes how agents store, share, and retrieve information — and alerts you when things go wrong.

## Three-Tier Memory Hierarchy

Sutures models agent memory using a research-backed three-tier architecture (based on MemoryOS, G-Memory, and related papers):

| Tier | Color | Description | Capacity |
|---|---|---|---|
| **STM** (Short-Term Memory) | Green `#10B981` | Active working memory for current task | ~8K tokens |
| **MTM** (Medium-Term Memory) | Amber `#F59E0B` | Indexed session memory, accessed multiple times | ~32K tokens |
| **LTM** (Long-Term Memory) | Purple `#8B5CF6` | Compressed persistent memory across sessions | ~128K tokens |

Memory migrates between tiers based on access frequency and importance:
- **Promotion**: STM items accessed 3+ times get promoted to MTM. High-value MTM items consolidate into LTM.
- **Eviction**: FIFO eviction within each tier when capacity is reached, with heat-based priority.

The `memory.tier_migration` event fires on every promotion or demotion, and you can set breakpoints on these transitions.

## Context Pressure Bar

The context pressure bar shows how full an agent's context window is:

| Range | Color | State |
|---|---|---|
| 0-60% | Green `#10B981` | Safe — agent has room to reason |
| 60-85% | Amber `#F59E0B` | High — agent may start dropping context |
| 85-100% | Red `#EF4444` | Cliff — context overflow imminent, quality degrades |

Set a breakpoint with `on_context_pressure` at 85% to pause agents before they hit the cliff.

## Shared Memory Map

The shared memory map visualizes which agents read and write to which memory keys:

- **Nodes** represent agents and memory keys
- **Edges** show read/write relationships
- **Staleness detection** highlights when an agent holds an outdated version of a shared key (indicated by red `#EF4444` edges)

When `memory.coherence_violation` fires, the map highlights the stale agent and the current writer, making it easy to trace shared memory bugs.

## 6 Memory Events

These events power the Memory Debugger and are based on 9 academic papers:

### `memory.tier_migration`
*Source: MemoryOS*

Fires when memory moves between STM, MTM, and LTM. Tracks promotion chains and eviction patterns.

```json
{ "key": "research_results", "from_tier": "stm", "to_tier": "mtm", "reason": "Accessed 3+ times" }
```

### `memory.conflict`
*Source: HiMem*

Fires when contradictory facts are detected in an agent's memory. Common when multiple agents write different values for the same key.

```json
{ "keys": ["market_size", "market_size_v2"], "conflict_description": "Conflicting market size estimates" }
```

### `memory.prune`
*Source: Focus Agent*

Fires when memory is pruned to free context window space. Shows what was lost and why.

```json
{ "keys": ["old_search_results"], "reason": "Context pressure at 92%", "tokens_freed": 2048 }
```

### `memory.reconsolidate`
*Source: H-MEM*

Fires when existing memory is updated with new evidence, changing the stored value.

```json
{ "key": "competitor_count", "old_value": "12 competitors", "new_value": "15 competitors (3 new entrants)" }
```

### `memory.structure_switch`
*Source: FluxMem*

Fires when an agent dynamically changes its memory organization strategy.

```json
{ "from_structure": "linear", "to_structure": "graph", "confidence": 0.87 }
```

### `memory.coherence_violation`
*Source: Multi-Agent Architecture*

Fires when an agent reads a shared memory key that has been updated by another agent since the last read.

```json
{ "key": "project_status", "stale_agent_id": "writer", "current_version": 3 }
```

## G-Memory Overlay

The G-Memory overlay renders a graph-based memory visualization on top of the topology canvas:

- **Insight nodes** — Key findings and conclusions
- **Query nodes** — Questions that led to insights
- **Interaction nodes** — Agent-to-agent exchanges

This overlay can be toggled on/off and is automatically disabled in lite mode (>20 agents) for performance.

## Pruning Heatmap

The pruning heatmap shows memory temperature across all agents:

- **Hot** (frequently accessed) — likely to be kept
- **Cold** (rarely accessed) — candidates for pruning

Use the `on_memory_tier_migration` breakpoint to pause before a prune operation and inspect what will be lost.
