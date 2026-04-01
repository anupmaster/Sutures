"""
SuturesCrewAIAdapter — Instruments CrewAI crews with Sutures event tracing.

Maps CrewAI's agent/task lifecycle to the Sutures 32-event protocol:
- Crew kickoff → agent.spawned for each agent
- Task execution → turn.started/thinking/acting/observed/completed
- Tool calls → turn.acting/observed
- Delegation → handoff.initiated/accepted/completed
- Agent completion → agent.completed with cost
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import time
import uuid
from functools import wraps
from typing import Any, Callable

from sutures_crewai.events import AgentEvent, make_event
from sutures_crewai.ws_client import SuturesWSClient

logger = logging.getLogger("sutures.crewai")


class SuturesCrewAIAdapter:
    """
    Instrument a CrewAI Crew with Sutures event tracing.

    Usage:
        adapter = SuturesCrewAIAdapter()
        adapter.instrument_crew(crew)
        crew.kickoff()
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
        self._connected = False

    def _get_agent_id(self, agent_name: str) -> str:
        """Get or create a stable agent_id for a CrewAI agent."""
        if agent_name not in self._agent_ids:
            self._agent_ids[agent_name] = agent_name.lower().replace(" ", "_")
        return self._agent_ids[agent_name]

    def _emit(self, event: AgentEvent) -> None:
        """Emit an event to the collector."""
        self._client.send_event_sync(event)

    def _next_turn(self, agent_id: str) -> int:
        """Increment and return the turn count for an agent."""
        self._turn_counts[agent_id] = self._turn_counts.get(agent_id, 0) + 1
        return self._turn_counts[agent_id]

    def _add_cost(self, agent_id: str, cost: float) -> float:
        """Add cost and return cumulative total."""
        self._costs[agent_id] = self._costs.get(agent_id, 0.0) + cost
        return self._costs[agent_id]

    async def connect(self) -> None:
        """Connect to the Sutures collector."""
        await self._client.connect()
        self._connected = True

    async def close(self) -> None:
        """Disconnect from the collector."""
        await self._client.close()
        self._connected = False

    def instrument_crew(self, crew: Any) -> Any:
        """
        Instrument a CrewAI Crew instance.

        Wraps the crew's agents and tasks with Sutures event emission.
        Call this before crew.kickoff().

        Args:
            crew: A CrewAI Crew instance.

        Returns:
            The same crew instance, now instrumented.
        """
        # Connect synchronously if not already connected
        if not self._connected:
            try:
                loop = asyncio.get_running_loop()
                loop.create_task(self.connect())
            except RuntimeError:
                asyncio.run(self.connect())

        # Emit agent.spawned for each agent in the crew
        for agent in getattr(crew, "agents", []):
            agent_name = getattr(agent, "role", None) or getattr(agent, "name", "unknown")
            agent_id = self._get_agent_id(agent_name)
            model = getattr(agent, "llm", None)
            model_name = str(model) if model else "unknown"

            # Get tools list
            tools = []
            for tool in getattr(agent, "tools", []):
                tool_name = getattr(tool, "name", None) or str(tool)
                tools.append(tool_name)

            # System prompt hash
            backstory = getattr(agent, "backstory", "") or ""
            sys_hash = hashlib.sha256(backstory.encode()).hexdigest()[:12]

            self._emit(make_event(
                self.swarm_id, agent_id, "agent.spawned",
                {
                    "name": agent_name,
                    "role": getattr(agent, "role", ""),
                    "model": model_name,
                    "tools": tools,
                    "system_prompt_hash": sys_hash,
                },
            ))

        # Wrap task execution
        self._wrap_task_execution(crew)

        return crew

    def _wrap_task_execution(self, crew: Any) -> None:
        """Wrap crew task execution to emit turn and tool events."""
        original_kickoff = getattr(crew, "kickoff", None)
        if not original_kickoff:
            return

        adapter = self

        @wraps(original_kickoff)
        def instrumented_kickoff(*args: Any, **kwargs: Any) -> Any:
            # Emit turn events for each task
            for task in getattr(crew, "tasks", []):
                agent = getattr(task, "agent", None)
                if not agent:
                    continue

                agent_name = getattr(agent, "role", None) or getattr(agent, "name", "unknown")
                agent_id = adapter._get_agent_id(agent_name)
                turn = adapter._next_turn(agent_id)

                task_desc = getattr(task, "description", "")[:300]

                adapter._emit(make_event(
                    adapter.swarm_id, agent_id, "turn.started",
                    {"turn_number": turn, "input": task_desc, "input_tokens": 0},
                ))

                adapter._emit(make_event(
                    adapter.swarm_id, agent_id, "turn.thinking",
                    {
                        "turn_number": turn,
                        "model": str(getattr(agent, "llm", "unknown")),
                        "content": f"Processing task: {task_desc[:100]}",
                    },
                    severity="debug",
                ))

                # Emit tool call events for task tools
                for tool in getattr(task, "tools", []) or getattr(agent, "tools", []):
                    tool_name = getattr(tool, "name", None) or str(tool)
                    adapter._emit(make_event(
                        adapter.swarm_id, agent_id, "turn.acting",
                        {
                            "turn_number": turn,
                            "tool_name": tool_name,
                            "tool_input_summary": f"Task: {task_desc[:100]}",
                        },
                    ))

            # Execute original kickoff
            start_time = time.time()
            result = original_kickoff(*args, **kwargs)
            duration_ms = (time.time() - start_time) * 1000

            # Emit completion events
            for agent in getattr(crew, "agents", []):
                agent_name = getattr(agent, "role", None) or getattr(agent, "name", "unknown")
                agent_id = adapter._get_agent_id(agent_name)
                cost = adapter._costs.get(agent_id, 0.0)

                adapter._emit(make_event(
                    adapter.swarm_id, agent_id, "agent.completed",
                    {
                        "total_cost_usd": cost,
                        "total_turns": adapter._turn_counts.get(agent_id, 0),
                    },
                ))

            return result

        crew.kickoff = instrumented_kickoff

    def emit_tool_result(
        self,
        agent_name: str,
        tool_name: str,
        output_summary: str,
        cost_usd: float = 0.0,
    ) -> None:
        """Manually emit a tool observation event."""
        agent_id = self._get_agent_id(agent_name)
        turn = self._turn_counts.get(agent_id, 1)
        cumulative = self._add_cost(agent_id, cost_usd)

        self._emit(make_event(
            self.swarm_id, agent_id, "turn.observed",
            {
                "turn_number": turn,
                "tool_name": tool_name,
                "tool_output_summary": output_summary[:500],
            },
        ))

        if cost_usd > 0:
            self._emit(make_event(
                self.swarm_id, agent_id, "cost.tokens",
                {
                    "model": "unknown",
                    "input_tokens": 0,
                    "output_tokens": 0,
                    "cost_usd": cost_usd,
                    "cumulative_cost_usd": cumulative,
                },
            ))

    def emit_handoff(
        self,
        from_agent: str,
        to_agent: str,
        reason: str = "",
    ) -> None:
        """Manually emit a handoff event between CrewAI agents."""
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
