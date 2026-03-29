"""
SuturesLangGraphAdapter — Main adapter class that instruments LangGraph graphs
with Sutures breakpoint support, event emission, and intervention capabilities.

Uses LangGraph's native interrupt()/Command(resume=) API for async-safe breakpoints.
NEVER uses threading.Event, asyncio.Event, or manual blocking.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import time
from typing import Any, AsyncIterator
from uuid import uuid4

from langgraph.checkpoint.sqlite.aio import AsyncSqliteSaver
from langgraph.types import Command, interrupt

from sutures_langgraph.breakpoint_engine import BreakpointEngine
from sutures_langgraph.cost import CostCalculator
from sutures_langgraph.events import (
    AgentEvent,
    BreakpointConfig,
    BreakpointParams,
    _now_iso,
    _uuid7,
    agent_paused,
    agent_resumed,
    breakpoint_hit,
    breakpoint_inject,
    breakpoint_release,
    breakpoint_set,
    checkpoint_created,
)
from sutures_langgraph.tracer import SuturesTracer
from sutures_langgraph.ws_client import SuturesWSClient

logger = logging.getLogger("sutures.adapter")

DEFAULT_CHECKPOINT_DB = "sutures_checkpoints.db"


class SuturesLangGraphAdapter:
    """Full-featured Sutures adapter for LangGraph.

    Provides:
    - Graph instrumentation with breakpoint-aware node wrappers
    - 13 breakpoint conditions evaluated locally (<10ms)
    - interrupt()/Command(resume=) based pause/resume (async-safe)
    - State injection via aupdate_state (through LangGraph reducers)
    - Time-travel via get_state_history + fork
    - Real-time event streaming to Sutures collector via WebSocket
    - Cost tracking with built-in model pricing

    Usage:
        adapter = SuturesLangGraphAdapter(agent_name="my-agent")
        graph = await adapter.instrument_graph(graph_builder, thread_id="t1")
        async for event in adapter.run_with_breakpoints(graph, input_data, thread_id="t1"):
            print(event)
    """

    def __init__(
        self,
        agent_name: str = "default",
        agent_id: str | None = None,
        swarm_id: str | None = None,
        parent_agent_id: str | None = None,
        model: str = "unknown",
        tools: list[str] | None = None,
        system_prompt: str | None = None,
        collector_url: str = "ws://localhost:9470/v1/events",
        checkpoint_db: str = DEFAULT_CHECKPOINT_DB,
        auto_connect: bool = True,
        custom_pricing: dict[str, Any] | None = None,
    ) -> None:
        self._agent_name = agent_name
        self._agent_id = agent_id or str(uuid4())
        self._swarm_id = swarm_id or _uuid7()
        self._parent_agent_id = parent_agent_id
        self._model = model
        self._tools = tools or []
        self._system_prompt_hash = (
            hashlib.sha256(system_prompt.encode()).hexdigest()
            if system_prompt
            else ""
        )
        self._checkpoint_db = checkpoint_db
        self._auto_connect = auto_connect

        # Components
        self._ws_client = SuturesWSClient(url=collector_url)
        self._cost_calculator = CostCalculator(custom_pricing)
        self._breakpoint_engine = BreakpointEngine(cost_calculator=self._cost_calculator)

        # Tracer (shared WS client)
        self._tracer = SuturesTracer(
            agent_name=agent_name,
            agent_id=self._agent_id,
            swarm_id=self._swarm_id,
            parent_agent_id=parent_agent_id,
            model=model,
            tools=tools,
            system_prompt=system_prompt,
            ws_client=self._ws_client,
            auto_connect=auto_connect,
        )

        # Checkpointer (initialized lazily)
        self._checkpointer: AsyncSqliteSaver | None = None

        # Thread tracking: thread_id -> compiled graph
        self._threads: dict[str, Any] = {}

        # Register WS command handlers
        self._ws_client.on_command("set_breakpoint", self._handle_set_breakpoint)
        self._ws_client.on_command("remove_breakpoint", self._handle_remove_breakpoint)
        self._ws_client.on_command("release", self._handle_release)
        self._ws_client.on_command("inject_and_resume", self._handle_inject_and_resume)

    @property
    def agent_id(self) -> str:
        return self._agent_id

    @property
    def swarm_id(self) -> str:
        return self._swarm_id

    @property
    def tracer(self) -> SuturesTracer:
        return self._tracer

    @property
    def breakpoint_engine(self) -> BreakpointEngine:
        return self._breakpoint_engine

    @property
    def cost_calculator(self) -> CostCalculator:
        return self._cost_calculator

    async def _ensure_checkpointer(self) -> AsyncSqliteSaver:
        """Lazily initialize the SQLite checkpointer."""
        if self._checkpointer is None:
            self._checkpointer = AsyncSqliteSaver.from_conn_string(self._checkpoint_db)
        return self._checkpointer

    async def connect(self) -> None:
        """Explicitly connect to the Sutures collector."""
        await self._ws_client.connect()

    async def disconnect(self) -> None:
        """Disconnect from the collector and clean up resources."""
        await self._tracer.shutdown()
        if self._checkpointer:
            # AsyncSqliteSaver manages its own connection lifecycle
            self._checkpointer = None

    # ---------------------------------------------------------------------------
    # Graph instrumentation
    # ---------------------------------------------------------------------------

    async def instrument_graph(
        self,
        graph_builder: Any,
        thread_id: str | None = None,
    ) -> Any:
        """Instrument a LangGraph StateGraph builder with breakpoint-aware nodes.

        Wraps each node with before/after breakpoint checks using LangGraph's
        native interrupt() API. Compiles with an AsyncSqliteSaver checkpointer.

        Args:
            graph_builder: A LangGraph StateGraph builder (not yet compiled).
            thread_id: Optional thread ID for tracking.

        Returns:
            The compiled graph with breakpoint instrumentation and checkpointer.
        """
        checkpointer = await self._ensure_checkpointer()

        # Wrap each node with breakpoint-aware logic
        nodes = dict(graph_builder.nodes)
        for node_name, node_fn in nodes.items():
            wrapped = self._breakpoint_aware_node(node_fn, node_name)
            graph_builder.nodes[node_name] = wrapped

        # Compile with checkpointer
        compiled = graph_builder.compile(checkpointer=checkpointer)

        if thread_id:
            self._threads[thread_id] = compiled

        return compiled

    def _breakpoint_aware_node(self, original_node: Any, node_name: str) -> Any:
        """Create a wrapper that checks breakpoint conditions before/after execution."""
        adapter = self

        async def wrapped(state: dict[str, Any], config: dict[str, Any] | None = None) -> Any:
            config = config or {}

            # BEFORE check — evaluate all 13 conditions
            bp = await adapter._breakpoint_engine.should_pause(
                "before", node_name, state, config
            )
            if bp:
                bp_id = str(uuid4())
                await adapter._emit_breakpoint_hit(bp, bp_id, node_name, state)
                # LangGraph native interrupt — raises GraphInterrupt, stream pauses
                interrupt({
                    "breakpoint_id": bp_id,
                    "type": "before",
                    "node": node_name,
                    "condition": bp.condition,
                })

            # Execute the original node
            if asyncio.iscoroutinefunction(original_node):
                result = await original_node(state, config)
            else:
                result = original_node(state, config)

            # Normalize result to dict
            result_state = result if isinstance(result, dict) else state

            # AFTER check — evaluate conditions on the result
            bp_after = await adapter._breakpoint_engine.should_pause(
                "after", node_name, result_state, config
            )
            if bp_after:
                bp_id = str(uuid4())
                await adapter._emit_breakpoint_hit(bp_after, bp_id, node_name, result_state)
                interrupt({
                    "breakpoint_id": bp_id,
                    "type": "after",
                    "node": node_name,
                    "condition": bp_after.condition,
                })

            return result

        # Preserve function metadata for LangGraph
        wrapped.__name__ = getattr(original_node, "__name__", node_name)
        wrapped.__qualname__ = getattr(original_node, "__qualname__", node_name)
        return wrapped

    async def _emit_breakpoint_hit(
        self,
        bp: BreakpointConfig,
        bp_id: str,
        node_name: str,
        state: dict[str, Any],
    ) -> None:
        """Emit breakpoint.hit and agent.paused events."""
        # Sanitize state for transmission (remove large objects)
        safe_state = _sanitize_state_snapshot(state)

        event = breakpoint_hit(
            self._swarm_id,
            self._agent_id,
            breakpoint_id=bp_id,
            node_name=node_name,
            state_snapshot=safe_state,
            reason=f"Condition '{bp.condition}' matched at node '{node_name}'",
        )
        await self._ws_client.send_event(event.to_dict())

        pause_event = agent_paused(
            self._swarm_id,
            self._agent_id,
            reason=f"Breakpoint {bp.condition} at {node_name}",
            breakpoint_id=bp_id,
        )
        await self._ws_client.send_event(pause_event.to_dict())

    # ---------------------------------------------------------------------------
    # Run with breakpoints
    # ---------------------------------------------------------------------------

    async def run_with_breakpoints(
        self,
        graph: Any,
        inputs: dict[str, Any],
        thread_id: str,
        *,
        config_overrides: dict[str, Any] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Run an instrumented graph, yielding events including breakpoint pauses.

        Uses astream_events for real-time event streaming. When a breakpoint fires,
        the stream pauses (does NOT terminate) and yields an on_interrupt event.

        Args:
            graph: A compiled LangGraph graph (from instrument_graph).
            inputs: Initial input state.
            thread_id: Thread ID for checkpointing.
            config_overrides: Additional RunnableConfig overrides.

        Yields:
            Stream events from LangGraph's astream_events.
        """
        config: dict[str, Any] = {
            "configurable": {
                "thread_id": thread_id,
                "sutures_agent_id": self._agent_id,
            },
            "callbacks": [self._tracer],
        }
        if config_overrides:
            config["configurable"].update(config_overrides.get("configurable", {}))
            if "callbacks" in config_overrides:
                config["callbacks"].extend(config_overrides["callbacks"])

        self._threads[thread_id] = graph

        async for event in graph.astream_events(inputs, config=config, version="v2"):
            yield event

    # ---------------------------------------------------------------------------
    # Resume and intervention
    # ---------------------------------------------------------------------------

    async def resume(
        self,
        thread_id: str,
        resume_value: Any = None,
        injection: dict[str, Any] | None = None,
    ) -> AsyncIterator[dict[str, Any]]:
        """Resume a paused graph from a breakpoint.

        Args:
            thread_id: Thread ID of the paused graph.
            resume_value: Value to pass to Command(resume=...).
            injection: State to inject via aupdate_state (goes through reducers).

        Yields:
            Stream events after resumption.
        """
        graph = self._threads.get(thread_id)
        if not graph:
            raise ValueError(f"No graph found for thread_id={thread_id}")

        config: dict[str, Any] = {
            "configurable": {
                "thread_id": thread_id,
                "sutures_agent_id": self._agent_id,
            },
            "callbacks": [self._tracer],
        }

        # Inject state if provided (goes through LangGraph reducers)
        if injection:
            await graph.aupdate_state(config, injection)
            inject_event = breakpoint_inject(
                self._swarm_id,
                self._agent_id,
                target_agent_id=self._agent_id,
                injection_type="append",
                channel="state",
                content=str(injection)[:500],
            )
            await self._ws_client.send_event(inject_event.to_dict())

        # Emit resumed event
        resumed_event = agent_resumed(
            self._swarm_id,
            self._agent_id,
            resumed_by="dashboard",
            injected_state=injection,
        )
        await self._ws_client.send_event(resumed_event.to_dict())

        # Resume with Command
        command = Command(resume=resume_value) if resume_value is not None else Command(resume=True)
        async for event in graph.astream_events(command, config=config, version="v2"):
            yield event

    # ---------------------------------------------------------------------------
    # Time-travel and forking
    # ---------------------------------------------------------------------------

    async def get_state_history(
        self, thread_id: str, limit: int = 50
    ) -> list[dict[str, Any]]:
        """Retrieve checkpoint history for a thread (reverse chronological).

        Args:
            thread_id: Thread ID to inspect.
            limit: Maximum number of snapshots to return.

        Returns:
            List of state snapshot dicts.
        """
        graph = self._threads.get(thread_id)
        if not graph:
            raise ValueError(f"No graph found for thread_id={thread_id}")

        config = {"configurable": {"thread_id": thread_id}}
        snapshots: list[dict[str, Any]] = []
        count = 0

        async for snapshot in graph.aget_state_history(config):
            snapshots.append({
                "config": snapshot.config,
                "values": snapshot.values,
                "next": list(snapshot.next) if snapshot.next else [],
                "created_at": str(snapshot.created_at) if snapshot.created_at else None,
                "parent_config": snapshot.parent_config,
            })
            count += 1
            if count >= limit:
                break

        return snapshots

    async def fork_from_checkpoint(
        self,
        thread_id: str,
        checkpoint_config: dict[str, Any],
        new_state: dict[str, Any],
    ) -> str:
        """Fork execution from a past checkpoint with modified state.

        Creates a new branch checkpoint by calling aupdate_state on a historical
        checkpoint. The forked state can then be resumed.

        Args:
            thread_id: Original thread ID.
            checkpoint_config: Config from a historical StateSnapshot (from get_state_history).
            new_state: State modifications to apply (goes through reducers).

        Returns:
            New thread_id for the forked branch.
        """
        graph = self._threads.get(thread_id)
        if not graph:
            raise ValueError(f"No graph found for thread_id={thread_id}")

        # Update state on the historical checkpoint — creates a fork
        fork_config = await graph.aupdate_state(checkpoint_config, new_state)

        # Register the fork under a new thread ID
        fork_thread_id = f"{thread_id}__fork__{uuid4().hex[:8]}"
        self._threads[fork_thread_id] = graph

        # Emit checkpoint.created for the fork
        fork_event = checkpoint_created(
            self._swarm_id,
            self._agent_id,
            checkpoint_id=fork_config.get("configurable", {}).get("checkpoint_id", str(uuid4())),
            thread_id=fork_thread_id,
            state_summary=f"Fork from {thread_id} with state injection",
            parent_checkpoint_id=checkpoint_config.get("configurable", {}).get("checkpoint_id"),
        )
        await self._ws_client.send_event(fork_event.to_dict())

        return fork_thread_id

    # ---------------------------------------------------------------------------
    # Breakpoint management (programmatic API)
    # ---------------------------------------------------------------------------

    async def add_breakpoint(
        self,
        condition: str,
        *,
        agent_id: str | None = None,
        params: dict[str, Any] | None = None,
    ) -> str:
        """Add a breakpoint condition.

        Args:
            condition: One of the 13 breakpoint conditions.
            agent_id: Scope to a specific agent (None = all agents).
            params: Condition-specific parameters.

        Returns:
            The breakpoint ID.
        """
        bp_id = str(uuid4())
        bp_params = BreakpointParams(**params) if params else None
        config = BreakpointConfig(
            id=bp_id,
            agent_id=agent_id or self._agent_id,
            condition=condition,
            enabled=True,
            params=bp_params,
        )
        self._breakpoint_engine.add_breakpoint(config)

        # Emit breakpoint.set event
        event = breakpoint_set(
            self._swarm_id,
            self._agent_id,
            breakpoint_id=bp_id,
            condition=condition,
            params=params,
        )
        await self._ws_client.send_event(event.to_dict())

        return bp_id

    async def remove_breakpoint(self, breakpoint_id: str) -> bool:
        """Remove a breakpoint by ID."""
        return self._breakpoint_engine.remove_breakpoint(breakpoint_id)

    # ---------------------------------------------------------------------------
    # WS command handlers (from collector/dashboard)
    # ---------------------------------------------------------------------------

    async def _handle_set_breakpoint(self, payload: dict[str, Any]) -> None:
        """Handle a set_breakpoint command from the collector."""
        condition = payload.get("condition", "always")
        agent_id = payload.get("agent_id")
        params = payload.get("params")
        bp_id = await self.add_breakpoint(condition, agent_id=agent_id, params=params)
        logger.info("Breakpoint set via collector: %s (%s)", bp_id, condition)

    async def _handle_remove_breakpoint(self, payload: dict[str, Any]) -> None:
        """Handle a remove_breakpoint command."""
        bp_id = payload.get("breakpoint_id", "")
        self._breakpoint_engine.remove_breakpoint(bp_id)
        logger.info("Breakpoint removed via collector: %s", bp_id)

    async def _handle_release(self, payload: dict[str, Any]) -> None:
        """Handle a release command — emits breakpoint.release event."""
        bp_id = payload.get("breakpoint_id", "")
        event = breakpoint_release(
            self._swarm_id,
            self._agent_id,
            breakpoint_id=bp_id,
            released_by=payload.get("released_by", "dashboard"),
        )
        await self._ws_client.send_event(event.to_dict())

    async def _handle_inject_and_resume(self, payload: dict[str, Any]) -> None:
        """Handle an inject_and_resume command from the dashboard.

        Note: The actual resume must be driven by the caller re-invoking
        resume() with the appropriate thread_id. This handler only emits
        the injection event.
        """
        thread_id = payload.get("thread_id", "")
        injection = payload.get("injection", {})

        if thread_id and injection:
            graph = self._threads.get(thread_id)
            if graph:
                config = {"configurable": {"thread_id": thread_id}}
                await graph.aupdate_state(config, injection)
                event = breakpoint_inject(
                    self._swarm_id,
                    self._agent_id,
                    target_agent_id=self._agent_id,
                    injection_type="append",
                    channel="state",
                    content=str(injection)[:500],
                )
                await self._ws_client.send_event(event.to_dict())
                logger.info("State injected for thread %s", thread_id)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _sanitize_state_snapshot(state: dict[str, Any], max_depth: int = 3) -> dict[str, Any]:
    """Create a safe snapshot of the state for transmission.

    Limits depth, truncates long strings, and converts non-serializable objects.
    """
    if max_depth <= 0:
        return {"_truncated": True}

    result: dict[str, Any] = {}
    for key, value in state.items():
        if key.startswith("_"):
            continue  # Skip internal keys
        if isinstance(value, str):
            result[key] = value[:500] if len(value) > 500 else value
        elif isinstance(value, (int, float, bool, type(None))):
            result[key] = value
        elif isinstance(value, dict):
            result[key] = _sanitize_state_snapshot(value, max_depth - 1)
        elif isinstance(value, (list, tuple)):
            items = []
            for item in value[:20]:  # Limit list items
                if isinstance(item, dict):
                    items.append(_sanitize_state_snapshot(item, max_depth - 1))
                elif isinstance(item, str):
                    items.append(item[:200])
                else:
                    items.append(str(item)[:200])
            if len(value) > 20:
                items.append(f"... ({len(value) - 20} more items)")
            result[key] = items
        else:
            # For LangChain message objects and other complex types
            result[key] = str(value)[:500]
    return result
