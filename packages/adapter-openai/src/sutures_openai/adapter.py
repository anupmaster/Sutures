"""
SuturesOpenAIAdapter — Instruments OpenAI Agents SDK with Sutures event tracing.

Maps OpenAI Agents SDK lifecycle to Sutures 32-event protocol:
- Agent run → agent.spawned + turn events
- Tool calls → turn.acting/observed
- Handoffs → handoff.initiated/accepted/completed
- Completion → agent.completed with cost
"""
from __future__ import annotations

import asyncio
import hashlib
import logging
import time
import uuid
from functools import wraps
from typing import Any, Callable

from sutures_openai.events import AgentEvent, make_event
from sutures_openai.ws_client import SuturesWSClient

logger = logging.getLogger("sutures.openai")


class SuturesOpenAIAdapter:
    """
    Instrument OpenAI Agents SDK with Sutures event tracing.

    Usage:
        from agents import Agent, Runner
        from sutures_openai import SuturesOpenAIAdapter

        adapter = SuturesOpenAIAdapter()

        # Option 1: Wrap a single run
        result = await adapter.trace_run(Runner.run, agent, "Hello")

        # Option 2: Instrument an agent
        adapter.instrument_agent(agent)
        result = await Runner.run(agent, "Hello")
    """

    def __init__(
        self,
        collector_url: str = "ws://localhost:9470/v1/events",
        swarm_id: str | None = None,
    ):
        self.collector_url = collector_url
        self.swarm_id = swarm_id or str(uuid.uuid4())[:8]
        self._client = SuturesWSClient(collector_url)
        self._agent_ids: dict[str, str] = {}
        self._turn_counts: dict[str, int] = {}
        self._costs: dict[str, float] = {}
        self._connected = False
        self._instrumented: set[str] = set()

    def _get_agent_id(self, agent_name: str) -> str:
        if agent_name not in self._agent_ids:
            self._agent_ids[agent_name] = agent_name.lower().replace(" ", "_")
        return self._agent_ids[agent_name]

    def _emit(self, event: AgentEvent) -> None:
        self._client.send_event_sync(event)

    def _next_turn(self, agent_id: str) -> int:
        self._turn_counts[agent_id] = self._turn_counts.get(agent_id, 0) + 1
        return self._turn_counts[agent_id]

    def _add_cost(self, agent_id: str, cost: float) -> float:
        self._costs[agent_id] = self._costs.get(agent_id, 0.0) + cost
        return self._costs[agent_id]

    async def connect(self) -> None:
        await self._client.connect()
        self._connected = True

    async def close(self) -> None:
        await self._client.close()
        self._connected = False

    def _ensure_connected(self) -> None:
        if not self._connected:
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(self.connect())
            except RuntimeError:
                asyncio.run(self.connect())

    def instrument_agent(self, agent: Any) -> Any:
        """
        Instrument an OpenAI Agents SDK Agent instance.

        Wraps the agent's tools with event emission and recursively
        instruments any handoff target agents.

        Works with ``agents.Agent`` instances from the ``openai-agents`` package.
        """
        agent_name = getattr(agent, "name", "unknown")
        agent_id = self._get_agent_id(agent_name)

        # Avoid double-instrumenting the same agent
        if agent_id in self._instrumented:
            return agent
        self._instrumented.add(agent_id)

        self._ensure_connected()

        model = getattr(agent, "model", "unknown") or "unknown"

        # Collect tool names
        tools: list[str] = []
        for tool in getattr(agent, "tools", []):
            tool_name = getattr(tool, "name", None) or getattr(tool, "__name__", str(tool))
            tools.append(tool_name)

        # Collect handoff target names
        handoffs: list[str] = []
        for h in getattr(agent, "handoffs", []):
            h_name = getattr(h, "name", None) or str(h)
            handoffs.append(h_name)

        # Hash system prompt for change detection
        instructions = getattr(agent, "instructions", "") or ""
        sys_hash = hashlib.sha256(instructions.encode()).hexdigest()[:12]

        self._emit(make_event(
            self.swarm_id,
            agent_id,
            "agent.spawned",
            {
                "name": agent_name,
                "role": agent_name,
                "model": str(model),
                "tools": tools,
                "handoffs": handoffs,
                "system_prompt_hash": sys_hash,
            },
        ))

        # Wrap tools to emit acting/observed events
        self._wrap_tools(agent)

        # Instrument handoff targets recursively
        for h in getattr(agent, "handoffs", []):
            target = getattr(h, "agent", h) if hasattr(h, "agent") else h
            if hasattr(target, "name"):
                self.instrument_agent(target)

        return agent

    def _wrap_tools(self, agent: Any) -> None:
        """Wrap agent tools to emit acting/observed events."""
        original_tools = getattr(agent, "tools", [])
        if not original_tools:
            return

        agent_name = getattr(agent, "name", "unknown")
        agent_id = self._get_agent_id(agent_name)
        adapter = self

        wrapped_tools = []
        for tool in original_tools:
            if callable(tool) and not getattr(tool, "_sutures_wrapped", False):
                tool_name = (
                    getattr(tool, "name", None)
                    or getattr(tool, "__name__", str(tool))
                )

                @wraps(tool)
                async def wrapped(*args: Any, _tool=tool, _name=tool_name, **kwargs: Any) -> Any:
                    turn = adapter._turn_counts.get(agent_id, 1)
                    adapter._emit(make_event(
                        adapter.swarm_id,
                        agent_id,
                        "turn.acting",
                        {
                            "turn_number": turn,
                            "tool_name": _name,
                            "tool_input_summary": str(kwargs)[:300],
                        },
                    ))

                    if asyncio.iscoroutinefunction(_tool):
                        result = await _tool(*args, **kwargs)
                    else:
                        result = _tool(*args, **kwargs)

                    adapter._emit(make_event(
                        adapter.swarm_id,
                        agent_id,
                        "turn.observed",
                        {
                            "turn_number": turn,
                            "tool_name": _name,
                            "tool_output_summary": str(result)[:500],
                        },
                    ))
                    return result

                wrapped._sutures_wrapped = True  # type: ignore[attr-defined]
                wrapped_tools.append(wrapped)
            else:
                wrapped_tools.append(tool)

        agent.tools = wrapped_tools

    async def trace_run(
        self,
        runner_run: Callable[..., Any],
        agent: Any,
        input_text: str,
        **kwargs: Any,
    ) -> Any:
        """
        Wrap a Runner.run() call with full Sutures tracing.

        Usage::

            result = await adapter.trace_run(Runner.run, agent, "Hello world")
        """
        self._ensure_connected()
        self.instrument_agent(agent)

        agent_name = getattr(agent, "name", "unknown")
        agent_id = self._get_agent_id(agent_name)
        turn = self._next_turn(agent_id)

        self._emit(make_event(
            self.swarm_id,
            agent_id,
            "turn.started",
            {"turn_number": turn, "input": input_text[:300], "input_tokens": 0},
        ))

        start_time = time.time()
        try:
            result = await runner_run(agent, input_text, **kwargs)
        except Exception as exc:
            duration_ms = (time.time() - start_time) * 1000
            self._emit(make_event(
                self.swarm_id,
                agent_id,
                "turn.failed",
                {
                    "turn_number": turn,
                    "error": str(exc)[:500],
                    "duration_ms": duration_ms,
                },
                severity="error",
            ))
            self._emit(make_event(
                self.swarm_id,
                agent_id,
                "agent.failed",
                {"error": str(exc)[:500], "total_turns": self._turn_counts.get(agent_id, 0)},
                severity="error",
            ))
            raise

        duration_ms = (time.time() - start_time) * 1000

        # Extract cost from result if available
        usage = getattr(result, "usage", None)
        if usage:
            input_tokens = getattr(usage, "input_tokens", 0)
            output_tokens = getattr(usage, "output_tokens", 0)
            # Approximate cost (GPT-4o class pricing)
            cost_usd = (input_tokens * 0.00001) + (output_tokens * 0.00003)
            cumulative = self._add_cost(agent_id, cost_usd)
            self._emit(make_event(
                self.swarm_id,
                agent_id,
                "cost.tokens",
                {
                    "model": str(getattr(agent, "model", "unknown")),
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "cost_usd": cost_usd,
                    "cumulative_cost_usd": cumulative,
                },
            ))

        self._emit(make_event(
            self.swarm_id,
            agent_id,
            "turn.completed",
            {
                "turn_number": turn,
                "output_summary": str(getattr(result, "final_output", ""))[:500],
                "duration_ms": duration_ms,
            },
        ))

        self._emit(make_event(
            self.swarm_id,
            agent_id,
            "agent.completed",
            {
                "total_cost_usd": self._costs.get(agent_id, 0.0),
                "total_turns": self._turn_counts.get(agent_id, 0),
            },
        ))

        return result

    def emit_handoff(self, from_agent: str, to_agent: str, reason: str = "") -> None:
        """Manually emit handoff events between two agents."""
        from_id = self._get_agent_id(from_agent)
        to_id = self._get_agent_id(to_agent)
        self._emit(make_event(
            self.swarm_id,
            from_id,
            "handoff.initiated",
            {"source_agent_id": from_id, "target_agent_id": to_id, "reason": reason},
        ))
        self._emit(make_event(
            self.swarm_id,
            to_id,
            "handoff.accepted",
            {"source_agent_id": from_id, "target_agent_id": to_id},
        ))

    def emit_cost(
        self,
        agent_name: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        cost_usd: float,
    ) -> None:
        """Manually emit a cost event for an agent."""
        agent_id = self._get_agent_id(agent_name)
        cumulative = self._add_cost(agent_id, cost_usd)
        self._emit(make_event(
            self.swarm_id,
            agent_id,
            "cost.tokens",
            {
                "model": model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cost_usd": cost_usd,
                "cumulative_cost_usd": cumulative,
            },
        ))
