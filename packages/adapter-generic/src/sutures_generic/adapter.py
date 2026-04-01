"""
SuturesAdapter — Framework-agnostic adapter using decorators and context managers.

Works with ANY agent framework. Instrument your agents with:
- Decorators: @adapter.trace_agent("name"), @adapter.trace_tool("name")
- Context managers: with adapter.agent_span("name"), with adapter.tool_span("name")
- Manual emission: adapter.emit(), adapter.emit_handoff(), adapter.emit_cost()
"""

from __future__ import annotations

import asyncio
import inspect
import logging
import time
import uuid
from contextlib import contextmanager
from functools import wraps
from typing import Any, Callable

from sutures_generic.events import AgentEvent, make_event
from sutures_generic.ws_client import SuturesWSClient

logger = logging.getLogger("sutures.generic")


class SuturesAdapter:
    """
    Framework-agnostic Sutures adapter using decorators and context managers.

    Usage:
        adapter = SuturesAdapter()
        await adapter.connect()

        @adapter.trace_agent("researcher", model="gpt-4o", tools=["search"])
        async def run_researcher(query: str) -> str:
            ...

        @adapter.trace_tool("web_search")
        def web_search(query: str) -> str:
            ...

        with adapter.agent_span("writer", model="claude-3") as span:
            result = do_work()

        adapter.emit_handoff("researcher", "writer", reason="research complete")
    """

    def __init__(
        self,
        collector_url: str = "ws://localhost:9470/v1/events",
        swarm_id: str | None = None,
    ) -> None:
        self.collector_url = collector_url
        self.swarm_id = swarm_id or str(uuid.uuid4())[:8]
        self._client = SuturesWSClient(collector_url)
        self._agent_ids: dict[str, str] = {}  # agent name → agent_id
        self._turn_counts: dict[str, int] = {}  # agent_id → turn count
        self._costs: dict[str, float] = {}  # agent_id → cumulative cost
        self._spawned: set[str] = set()  # agent_ids that have been spawned
        self._connected = False

    def _get_agent_id(self, agent_name: str) -> str:
        """Get or create a stable agent_id from a name."""
        if agent_name not in self._agent_ids:
            self._agent_ids[agent_name] = agent_name.lower().replace(" ", "_")
        return self._agent_ids[agent_name]

    def _emit(self, event: AgentEvent) -> None:
        """Emit an event to the collector (fire and forget)."""
        self._client.send_event_sync(event)

    def _next_turn(self, agent_id: str) -> int:
        """Increment and return the turn count for an agent."""
        self._turn_counts[agent_id] = self._turn_counts.get(agent_id, 0) + 1
        return self._turn_counts[agent_id]

    def _add_cost(self, agent_id: str, cost: float) -> float:
        """Add cost and return cumulative total."""
        self._costs[agent_id] = self._costs.get(agent_id, 0.0) + cost
        return self._costs[agent_id]

    def _ensure_spawned(
        self, agent_id: str, name: str, model: str = "unknown", role: str = "", tools: list[str] | None = None
    ) -> None:
        """Emit agent.spawned if this agent hasn't been spawned yet."""
        if agent_id not in self._spawned:
            self._spawned.add(agent_id)
            self._emit(make_event(
                self.swarm_id, agent_id, "agent.spawned",
                {
                    "name": name,
                    "role": role,
                    "model": model,
                    "tools": tools or [],
                    "system_prompt_hash": "",
                },
            ))

    async def connect(self) -> None:
        """Connect to the Sutures collector."""
        await self._client.connect()
        self._connected = True

    async def close(self) -> None:
        """Disconnect from the collector."""
        await self._client.close()
        self._connected = False

    # ── Decorators ──────────────────────────────────────────────────────

    def trace_agent(
        self,
        name: str,
        *,
        model: str = "unknown",
        role: str = "",
        tools: list[str] | None = None,
    ) -> Callable:
        """
        Decorator that emits agent.spawned on first call, turn events on each call.

        Works with both sync and async functions.

        Usage:
            @adapter.trace_agent("researcher", model="gpt-4o", tools=["search"])
            async def run_researcher(query: str) -> str:
                ...
        """
        adapter = self

        def decorator(fn: Callable) -> Callable:
            agent_id = adapter._get_agent_id(name)

            if inspect.iscoroutinefunction(fn):
                @wraps(fn)
                async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                    adapter._ensure_spawned(agent_id, name, model, role, tools)
                    turn = adapter._next_turn(agent_id)

                    # Derive input summary from first positional arg or kwargs
                    input_summary = ""
                    if args:
                        input_summary = str(args[0])[:300]
                    elif kwargs:
                        first_val = next(iter(kwargs.values()))
                        input_summary = str(first_val)[:300]

                    adapter._emit(make_event(
                        adapter.swarm_id, agent_id, "turn.started",
                        {"turn_number": turn, "input": input_summary, "input_tokens": 0},
                    ))

                    start = time.time()
                    try:
                        result = await fn(*args, **kwargs)
                        duration_ms = (time.time() - start) * 1000

                        output_summary = str(result)[:500] if result is not None else ""
                        adapter._emit(make_event(
                            adapter.swarm_id, agent_id, "turn.completed",
                            {
                                "turn_number": turn,
                                "output": output_summary,
                                "duration_ms": round(duration_ms, 1),
                                "output_tokens": 0,
                            },
                        ))
                        return result
                    except Exception as exc:
                        duration_ms = (time.time() - start) * 1000
                        adapter._emit(make_event(
                            adapter.swarm_id, agent_id, "turn.failed",
                            {
                                "turn_number": turn,
                                "error": str(exc)[:500],
                                "duration_ms": round(duration_ms, 1),
                            },
                            severity="error",
                        ))
                        raise

                return async_wrapper
            else:
                @wraps(fn)
                def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                    adapter._ensure_spawned(agent_id, name, model, role, tools)
                    turn = adapter._next_turn(agent_id)

                    input_summary = ""
                    if args:
                        input_summary = str(args[0])[:300]
                    elif kwargs:
                        first_val = next(iter(kwargs.values()))
                        input_summary = str(first_val)[:300]

                    adapter._emit(make_event(
                        adapter.swarm_id, agent_id, "turn.started",
                        {"turn_number": turn, "input": input_summary, "input_tokens": 0},
                    ))

                    start = time.time()
                    try:
                        result = fn(*args, **kwargs)
                        duration_ms = (time.time() - start) * 1000

                        output_summary = str(result)[:500] if result is not None else ""
                        adapter._emit(make_event(
                            adapter.swarm_id, agent_id, "turn.completed",
                            {
                                "turn_number": turn,
                                "output": output_summary,
                                "duration_ms": round(duration_ms, 1),
                                "output_tokens": 0,
                            },
                        ))
                        return result
                    except Exception as exc:
                        duration_ms = (time.time() - start) * 1000
                        adapter._emit(make_event(
                            adapter.swarm_id, agent_id, "turn.failed",
                            {
                                "turn_number": turn,
                                "error": str(exc)[:500],
                                "duration_ms": round(duration_ms, 1),
                            },
                            severity="error",
                        ))
                        raise

                return sync_wrapper

        return decorator

    def trace_tool(self, tool_name: str) -> Callable:
        """
        Decorator that emits turn.acting/turn.observed around tool execution.

        Works with both sync and async functions.

        Usage:
            @adapter.trace_tool("web_search")
            def web_search(query: str) -> str:
                ...
        """
        adapter = self

        def decorator(fn: Callable) -> Callable:
            if inspect.iscoroutinefunction(fn):
                @wraps(fn)
                async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                    # Infer agent_id from the most recently active agent
                    agent_id = adapter._last_active_agent_id()
                    turn = adapter._turn_counts.get(agent_id, 1)

                    input_summary = ""
                    if args:
                        input_summary = str(args[0])[:300]
                    elif kwargs:
                        first_val = next(iter(kwargs.values()))
                        input_summary = str(first_val)[:300]

                    adapter._emit(make_event(
                        adapter.swarm_id, agent_id, "turn.acting",
                        {
                            "turn_number": turn,
                            "tool_name": tool_name,
                            "tool_input_summary": input_summary,
                        },
                    ))

                    start = time.time()
                    try:
                        result = await fn(*args, **kwargs)
                        duration_ms = (time.time() - start) * 1000

                        output_summary = str(result)[:500] if result is not None else ""
                        adapter._emit(make_event(
                            adapter.swarm_id, agent_id, "turn.observed",
                            {
                                "turn_number": turn,
                                "tool_name": tool_name,
                                "tool_output_summary": output_summary,
                                "duration_ms": round(duration_ms, 1),
                            },
                        ))
                        return result
                    except Exception as exc:
                        duration_ms = (time.time() - start) * 1000
                        adapter._emit(make_event(
                            adapter.swarm_id, agent_id, "turn.observed",
                            {
                                "turn_number": turn,
                                "tool_name": tool_name,
                                "tool_output_summary": f"ERROR: {exc!s}"[:500],
                                "duration_ms": round(duration_ms, 1),
                            },
                            severity="error",
                        ))
                        raise

                return async_wrapper
            else:
                @wraps(fn)
                def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                    agent_id = adapter._last_active_agent_id()
                    turn = adapter._turn_counts.get(agent_id, 1)

                    input_summary = ""
                    if args:
                        input_summary = str(args[0])[:300]
                    elif kwargs:
                        first_val = next(iter(kwargs.values()))
                        input_summary = str(first_val)[:300]

                    adapter._emit(make_event(
                        adapter.swarm_id, agent_id, "turn.acting",
                        {
                            "turn_number": turn,
                            "tool_name": tool_name,
                            "tool_input_summary": input_summary,
                        },
                    ))

                    start = time.time()
                    try:
                        result = fn(*args, **kwargs)
                        duration_ms = (time.time() - start) * 1000

                        output_summary = str(result)[:500] if result is not None else ""
                        adapter._emit(make_event(
                            adapter.swarm_id, agent_id, "turn.observed",
                            {
                                "turn_number": turn,
                                "tool_name": tool_name,
                                "tool_output_summary": output_summary,
                                "duration_ms": round(duration_ms, 1),
                            },
                        ))
                        return result
                    except Exception as exc:
                        duration_ms = (time.time() - start) * 1000
                        adapter._emit(make_event(
                            adapter.swarm_id, agent_id, "turn.observed",
                            {
                                "turn_number": turn,
                                "tool_name": tool_name,
                                "tool_output_summary": f"ERROR: {exc!s}"[:500],
                                "duration_ms": round(duration_ms, 1),
                            },
                            severity="error",
                        ))
                        raise

                return sync_wrapper

        return decorator

    # ── Context Managers ────────────────────────────────────────────────

    @contextmanager
    def agent_span(self, name: str, *, model: str = "unknown", role: str = ""):
        """
        Context manager that emits agent.spawned on enter, agent.completed on exit.

        Usage:
            with adapter.agent_span("writer", model="claude-3") as span:
                result = do_work()
                span["output"] = result
        """
        agent_id = self._get_agent_id(name)
        self._ensure_spawned(agent_id, name, model, role)

        span: dict[str, Any] = {"agent_id": agent_id, "name": name, "output": ""}
        start = time.time()

        try:
            yield span
            duration_ms = (time.time() - start) * 1000
            self._emit(make_event(
                self.swarm_id, agent_id, "agent.completed",
                {
                    "total_cost_usd": self._costs.get(agent_id, 0.0),
                    "total_turns": self._turn_counts.get(agent_id, 0),
                    "duration_ms": round(duration_ms, 1),
                    "output": str(span.get("output", ""))[:500],
                },
            ))
        except Exception as exc:
            duration_ms = (time.time() - start) * 1000
            self._emit(make_event(
                self.swarm_id, agent_id, "agent.failed",
                {
                    "error": str(exc)[:500],
                    "duration_ms": round(duration_ms, 1),
                    "total_cost_usd": self._costs.get(agent_id, 0.0),
                    "total_turns": self._turn_counts.get(agent_id, 0),
                },
                severity="error",
            ))
            raise

    @contextmanager
    def tool_span(self, tool_name: str, *, agent_name: str):
        """
        Context manager that emits turn.acting on enter, turn.observed on exit.

        Usage:
            with adapter.tool_span("search", agent_name="researcher") as span:
                result = search_api(query)
                span["output"] = result
        """
        agent_id = self._get_agent_id(agent_name)
        turn = self._turn_counts.get(agent_id, 1)

        span: dict[str, Any] = {"agent_id": agent_id, "tool_name": tool_name, "output": ""}

        self._emit(make_event(
            self.swarm_id, agent_id, "turn.acting",
            {
                "turn_number": turn,
                "tool_name": tool_name,
                "tool_input_summary": "",
            },
        ))

        start = time.time()
        try:
            yield span
            duration_ms = (time.time() - start) * 1000
            self._emit(make_event(
                self.swarm_id, agent_id, "turn.observed",
                {
                    "turn_number": turn,
                    "tool_name": tool_name,
                    "tool_output_summary": str(span.get("output", ""))[:500],
                    "duration_ms": round(duration_ms, 1),
                },
            ))
        except Exception as exc:
            duration_ms = (time.time() - start) * 1000
            self._emit(make_event(
                self.swarm_id, agent_id, "turn.observed",
                {
                    "turn_number": turn,
                    "tool_name": tool_name,
                    "tool_output_summary": f"ERROR: {exc!s}"[:500],
                    "duration_ms": round(duration_ms, 1),
                },
                severity="error",
            ))
            raise

    # ── Manual Emission ─────────────────────────────────────────────────

    def emit(self, agent_name: str, event_type: str, data: dict[str, Any]) -> None:
        """
        Manually emit any event type.

        Usage:
            adapter.emit("researcher", "memory.write", {"key": "findings", "value": "..."})
        """
        agent_id = self._get_agent_id(agent_name)
        self._emit(make_event(self.swarm_id, agent_id, event_type, data))

    def emit_handoff(self, from_agent: str, to_agent: str, reason: str = "") -> None:
        """
        Emit a handoff event between two agents.

        Usage:
            adapter.emit_handoff("researcher", "writer", reason="research complete")
        """
        from_id = self._get_agent_id(from_agent)
        to_id = self._get_agent_id(to_agent)

        self._emit(make_event(
            self.swarm_id, from_id, "handoff.initiated",
            {
                "source_agent_id": from_id,
                "target_agent_id": to_id,
                "reason": reason,
            },
        ))

        self._emit(make_event(
            self.swarm_id, to_id, "handoff.accepted",
            {
                "source_agent_id": from_id,
                "target_agent_id": to_id,
            },
        ))

    def emit_cost(
        self,
        agent_name: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        cost_usd: float,
    ) -> None:
        """
        Emit a cost event for an agent.

        Usage:
            adapter.emit_cost("researcher", "gpt-4o", 1500, 300, 0.02)
        """
        agent_id = self._get_agent_id(agent_name)
        cumulative = self._add_cost(agent_id, cost_usd)

        self._emit(make_event(
            self.swarm_id, agent_id, "cost.tokens",
            {
                "model": model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cost_usd": cost_usd,
                "cumulative_cost_usd": cumulative,
            },
        ))

    # ── Internal Helpers ────────────────────────────────────────────────

    def _last_active_agent_id(self) -> str:
        """Return the agent_id with the highest turn count (most recently active)."""
        if not self._turn_counts:
            # Fallback: return first known agent or a default
            if self._agent_ids:
                return next(iter(self._agent_ids.values()))
            return "unknown"
        return max(self._turn_counts, key=self._turn_counts.get)  # type: ignore[arg-type]
