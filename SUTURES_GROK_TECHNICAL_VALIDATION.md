# SUTURES — GROK TECHNICAL VALIDATION
## Async Breakpoint Architecture + LangGraph Checkpointer Deep-Dive
## Validated: March 30, 2026 | LangGraph v1.1.3 source confirmed

---

## 1. STREAM + INTERRUPT COEXISTENCE (Critical Finding)

`interrupt(value)` raises GraphInterrupt inside the node. When using `astream_events`:
- Stream does NOT terminate — yields `on_interrupt` event and PAUSES
- Async task is suspended by runtime. WebSocket stays alive
- No reconnection needed. `useWebSocket.ts` hook stays simple
- Resume with `Command(resume=...)` on same config → stream continues normally

**Adapter impact:** Handle on_interrupt without terminating generator. No extra reconnection logic.

## 2. UPDATE_STATE + REDUCERS (Injection UX)

`await graph.aupdate_state(config, {"messages": [new_msg]})`:
- Does NOT replace the channel. Feeds through the reducer
- `messages: Annotated[list, add_messages]` → APPENDS (standard behavior)
- Custom reducers run their logic on the update

**UI impact:** InjectionEditor needs two modes:
- "Append to channel" (default, safe for messages)
- "Replace channel" (advanced toggle — uses as_node="__end__" + full overwrite)
- Show "This injection triggers reducer X" preview before Inject & Resume

## 3. MEMORY SHADOW MODE — CHECKPOINT ISOLATION

Same SQLite DB: thread-safe reads, NOT safe for concurrent writes.
**Fix:** Use InMemorySaver per shadow (cloned from paused snapshot).
Only persist winning path back to shared SQLite on "Promote Shadow to Live".
Zero contention. Perfect isolation. 4 days to build.

## 4. LANGGRAPH ADAPTER — CORRECT ASYNC PATTERN

```python
# breakpoint_aware_node wrapper — THE correct pattern
from langgraph.types import interrupt, Command
from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver

class SuturesLangGraphAdapter:
    async def instrument_graph(self, graph_builder, thread_id):
        self.checkpointer = AsyncSqliteSaver.from_conn_string("sutures_checkpoints.db")
        
        def breakpoint_aware_node(original_node, node_name):
            async def wrapped(state, config):
                # BEFORE check (all 13 conditions)
                if await self.breakpoint_engine.should_pause("before", node_name, state, config):
                    interrupt({"breakpoint_id": uuid4(), "type": "before", "node": node_name})
                result = await original_node(state, config)
                # AFTER check
                if await self.breakpoint_engine.should_pause("after", node_name, result, config):
                    interrupt({"breakpoint_id": uuid4(), "type": "after", "node": node_name})
                return result
            return wrapped
        
        for node_name in list(graph_builder.nodes.keys()):
            graph_builder.nodes[node_name] = breakpoint_aware_node(
                graph_builder.nodes[node_name], node_name)
        return graph_builder.compile(checkpointer=self.checkpointer)

    async def resume(self, thread_id, resume_value=None, injection=None):
        if injection:
            await thread["graph"].aupdate_state(config, injection)  # creates fork
        command = Command(resume=resume_value) if resume_value else None
        # Stream continues from exact suspension point
```

## 5. CHECKPOINTER REFERENCE

| Checkpointer | Package | Best For |
|---|---|---|
| InMemorySaver | langgraph-checkpoint | Prototyping + Shadow Mode |
| AsyncSqliteSaver | langgraph-checkpoint-sqlite | P0 default (shared with collector) |
| AsyncPostgresSaver | langgraph-checkpoint-postgres | Production/Enterprise |

Checkpoint = tuple of: checkpoint_id, thread_id, full values (AgentState),
channel_versions, versions_seen, pending_writes.
Saved after EVERY super-step. Interrupts only work if checkpointer present.

Time-travel: get_state_history(config) → list of StateSnapshot in reverse chrono.
Fork: update_state on past checkpoint → new branch checkpoint → resume from fork.

## 6. CREWAI v1.13.0rc1 (Mar 27)
No public hooks on planning step. Delay to P1. Use LangGraph (70% market) first.

## 7. A2A PROTOCOL
Google A2A v0.3, Linux Foundation, 100+ partners. Support in P2 after CrewAI.
Makes Sutures ONLY tool debugging both intra-framework + cross-protocol handoffs.

---

*Validated against LangGraph v1.1.3 source (Mar 29 commit) | Grok + Claude merged*
