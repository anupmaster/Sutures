# MCP Tools Reference

Sutures exposes 18 MCP tools organized into 4 categories. These tools are accessible from Claude Code, Cursor, or any MCP-compatible client.

## Topology Tools (5)

### `list_agents`

List all active agents across all swarms.

**Parameters**: None (or optional `swarm_id` to filter)

**Returns**: Array of agents with `agent_id`, `name`, `status`, `model`, `role`, `spawned_at`

**Example prompt**: "What agents are running right now?"

---

### `get_agent_state`

Get the full state of a specific agent, including its current status, turn count, tools used, and recent events.

**Parameters**: `agent_id` (required)

**Returns**: Agent state object with status, memory contents, recent events, cost

**Example prompt**: "What is the researcher agent doing?"

---

### `get_topology`

Get the complete swarm topology graph, including all agents and the edges (handoffs/delegations) between them.

**Parameters**: `swarm_id` (optional)

**Returns**: `{ agents: Record<string, TopologyAgent>, edges: TopologyEdge[] }`

**Example prompt**: "Show me the agent topology"

---

### `get_errors`

List all error and failure events across the swarm.

**Parameters**: `swarm_id` (optional), `limit` (optional, default 100)

**Returns**: Array of error events with agent ID, error message, stack trace

**Example prompt**: "Are there any errors in the swarm?"

---

### `get_swarm_summary`

High-level summary of the swarm: total agents, status breakdown, total cost, anomalies detected.

**Parameters**: `swarm_id` (optional)

**Returns**: `{ agent_count, status_breakdown, total_cost_usd, anomaly_count, duration_ms }`

**Example prompt**: "Give me a summary of the current run"

---

## Memory Tools (5)

### `get_context_window`

See exactly what an agent has in its context window — the messages, system prompt, and tool results that form its working memory.

**Parameters**: `agent_id` (required)

**Returns**: Context window contents with token counts and pressure percentage

**Example prompt**: "What's in the writer's context window?"

---

### `get_memory_hierarchy`

View the three-tier memory hierarchy (STM/MTM/LTM) for an agent.

**Parameters**: `agent_id` (required)

**Returns**: `{ stm: Record, mtm: Record, ltm: Record, pressure_percent: number }`

**Example prompt**: "Show me the researcher's memory tiers"

---

### `get_shared_memory_map`

See all shared memory keys with their readers and writers, including staleness information.

**Parameters**: `swarm_id` (optional)

**Returns**: Map of shared keys to `{ writer_agent_id, reader_agent_ids[], version, stale_readers[] }`

**Example prompt**: "Which agents are sharing memory and is anything stale?"

---

### `get_memory_traversal_path`

Trace how a specific memory key was accessed and modified over time.

**Parameters**: `key` (required), `swarm_id` (optional)

**Returns**: Ordered list of read/write/migrate events for the key

**Example prompt**: "How was the 'research_results' key used?"

---

### `simulate_prune`

Preview what would be pruned if context pressure reached a given level, without actually pruning.

**Parameters**: `agent_id` (required), `target_pressure` (optional, percentage)

**Returns**: List of keys that would be pruned with their sizes and access frequency

**Example prompt**: "What would the researcher lose if we pruned to 60% context?"

---

## Breakpoint Tools (5)

### `set_breakpoint`

Set a breakpoint with any of the 13 supported conditions.

**Parameters**: `condition` (required), `agent_id` (optional), `swarm_id` (optional), `value` (optional), `once` (optional)

**Returns**: `{ breakpoint_id }`

**Example prompt**: "Set a breakpoint when the writer calls write_document"

---

### `release_breakpoint`

Remove an active breakpoint.

**Parameters**: `breakpoint_id` (required)

**Returns**: `{ removed: boolean }`

**Example prompt**: "Release breakpoint bp-001"

---

### `inject_and_resume`

Inject state or messages into a paused agent and resume execution.

**Parameters**: `agent_id` (required), `state` (optional), `messages` (optional), `mode` (optional: `"append"` | `"replace"`)

**Returns**: `{ event_id }`

**Example prompt**: "Tell the writer to focus on code examples, then resume"

---

### `get_checkpoints`

List all checkpoints for a given execution thread.

**Parameters**: `thread_id` (required)

**Returns**: Array of checkpoints with IDs, timestamps, and parent references

**Example prompt**: "Show me all checkpoints for thread-1"

---

### `fork_from_checkpoint`

Create a forked execution branch from an existing checkpoint.

**Parameters**: `checkpoint_id` (required)

**Returns**: Forked checkpoint with new `thread_id` and `parent_checkpoint_id`

**Example prompt**: "Fork from checkpoint cp-001 so I can try a different approach"

---

## Analysis Tools (3)

### `get_root_cause`

AI-powered root cause analysis for agent failures. Analyzes the event history, memory state, and handoff chain to identify the most likely cause.

**Parameters**: `agent_id` (required) or `error_event_id` (required)

**Returns**: `{ root_cause, evidence[], recommendations[], confidence }`

**Example prompt**: "Why did the writer fail?"

---

### `get_cost_breakdown`

Detailed cost breakdown by agent, model, and tool call.

**Parameters**: `swarm_id` (optional)

**Returns**: `{ total_usd, by_agent: Record, by_model: Record, by_tool: Record }`

**Example prompt**: "How much has this run cost and where is the money going?"

---

### `export_trace`

Export the full event trace for offline analysis, sharing, or integration with other tools.

**Parameters**: `swarm_id` (optional), `format` (optional: `"json"` | `"otlp"`)

**Returns**: Full trace data in the requested format

**Example prompt**: "Export the trace for this run"
