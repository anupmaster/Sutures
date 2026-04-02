# Fork & Replay

Fork & Replay is time-travel debugging for agent systems. Save checkpoints at any point during execution, fork to create alternative execution paths, and replay from any checkpoint with different parameters.

## Checkpoints

Checkpoints capture the full state of an agent at a point in time:

```typescript
{
  checkpoint_id: string,         // Unique identifier
  thread_id: string,             // Execution thread
  agent_id: string,              // Agent that was checkpointed
  swarm_id: string,              // Swarm context
  state: unknown,                // Full agent state
  memory_hierarchy: unknown,     // STM/MTM/LTM contents
  parent_checkpoint_id?: string, // Parent (for fork trees)
  created_at: string             // ISO 8601 timestamp
}
```

Checkpoints are stored in SQLite (`better-sqlite3`) and shared between the adapter and the collector for zero-copy access.

### Automatic Checkpoints

When `auto_checkpoint` is enabled in the adapter, checkpoints are created:
- At each `turn.completed` event
- Before each `handoff.initiated` event
- When a `breakpoint.hit` occurs

### Manual Checkpoints

Emit a `checkpoint.created` event from your adapter to save state at any point:

```python
tracer.emit("checkpoint.created", agent_id="researcher", data={
    "checkpoint_id": "cp-001",
    "thread_id": "thread-main",
    "state": agent.get_state(),
    "memory_hierarchy": agent.get_memory(),
})
```

## Forking

Forking creates a new execution branch from an existing checkpoint. The forked checkpoint gets a new `thread_id` with a `:fork:` suffix and maintains a `parent_checkpoint_id` reference.

### Via WebSocket

```json
{
  "type": "command",
  "command": "fork_from_checkpoint",
  "payload": {
    "checkpoint_id": "cp-001"
  }
}
```

### Via MCP Tool

```
fork_from_checkpoint(checkpoint_id="cp-001")
```

### Via REST API

```bash
# First, list checkpoints for a thread
curl http://localhost:9471/api/checkpoints?thread_id=thread-main

# Then fork from a specific checkpoint
# (Use WebSocket command or MCP tool for forking)
```

## Replay

After forking, you can replay the agent from the forked checkpoint with modifications:

1. **Fork** from the desired checkpoint
2. **Inject** modified state or messages into the forked checkpoint
3. **Resume** execution on the new fork

This lets you answer questions like:
- "What would have happened if the researcher used a different search query?"
- "What if the critic's score threshold was lower?"
- "What if we injected additional context before the writer started?"

## Shadow Mode

Shadow agents use `InMemorySaver` (not the shared SQLite) to avoid write contention. Only the winning shadow path is persisted via `aupdate_state` on promote.

```python
# Spawn a shadow execution from a checkpoint
spawn_shadow(thread_id="thread-main", checkpoint_id="cp-001")
```

Shadow mode lets you test alternative execution paths without affecting the main execution or polluting the checkpoint database.

## Viewing Fork Trees

The Timeline panel in the dashboard shows fork points as branching markers. Each fork creates a new swim lane, and you can switch between branches to compare execution paths.

The MCP tool `get_checkpoints(thread_id)` returns the full checkpoint history including fork relationships.
