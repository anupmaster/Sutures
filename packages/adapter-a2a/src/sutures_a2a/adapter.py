"""
SuturesA2AAdapter — Trace Google A2A protocol messages through Sutures.

Maps A2A task lifecycle and messages to Sutures AgentEvent protocol v1.0:

    A2A Concept              → Sutures Event
    ─────────────────────────────────────────
    Task created             → agent.spawned
    Task working             → turn.started
    Task completed           → agent.completed
    Task failed              → agent.failed
    Task canceled            → agent.paused
    Message (user→agent)     → turn.started with input
    Message (agent→user)     → turn.completed with output
    Artifact produced        → turn.observed
    Task push notification   → handoff.initiated
    Streaming update         → turn.thinking

Usage with an A2A server handler:

    adapter = SuturesA2AAdapter()
    await adapter.connect()

    # Wrap your handler
    @adapter.trace_task("my_agent")
    async def handle_task(task: dict) -> dict:
        ...

    # Or trace manually
    adapter.on_task_created(task_id, agent_name="researcher")
    adapter.on_task_status_changed(task_id, status="working")
    adapter.on_message(task_id, role="agent", content="Found 3 results")
    adapter.on_artifact(task_id, artifact_type="file", name="report.pdf")
    adapter.on_task_status_changed(task_id, status="completed")
"""

from __future__ import annotations

import inspect
import logging
import time
import uuid
from functools import wraps
from typing import Any, Callable

from sutures_a2a.events import AgentEvent, make_event
from sutures_a2a.ws_client import SuturesWSClient

logger = logging.getLogger("sutures.a2a")

# A2A task status → Sutures event type mapping
_STATUS_MAP: dict[str, str] = {
    "submitted": "agent.spawned",
    "working": "turn.started",
    "completed": "agent.completed",
    "failed": "agent.failed",
    "canceled": "agent.paused",
    "input-required": "agent.paused",
}


class SuturesA2AAdapter:
    """
    Traces Google A2A (Agent-to-Agent) protocol messages through Sutures.

    Provides three integration patterns:
    1. Decorator: @adapter.trace_task("agent_name") on your A2A handler
    2. Middleware: adapter.wrap_handler(handler) for automatic tracing
    3. Manual: adapter.on_task_created(), on_message(), etc.
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
        self._task_agents: dict[str, str] = {}  # task_id → agent_id
        self._task_names: dict[str, str] = {}  # task_id → agent name
        self._turn_counts: dict[str, int] = {}  # agent_id → turn count
        self._costs: dict[str, float] = {}  # agent_id → cumulative cost
        self._spawned: set[str] = set()  # agent_ids that have been spawned
        self._task_start_times: dict[str, float] = {}  # task_id → start time
        self._connected = False

    # ── Connection ─────────────────────────────────────────────────────

    async def connect(self) -> None:
        """Connect to the Sutures collector."""
        await self._client.connect()
        self._connected = True

    async def close(self) -> None:
        """Disconnect from the collector."""
        await self._client.close()
        self._connected = False

    # ── Internal Helpers ───────────────────────────────────────────────

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

    def _resolve_agent(self, task_id: str, agent_name: str | None = None) -> tuple[str, str]:
        """Resolve agent_id and name from task_id or explicit agent_name."""
        if agent_name:
            agent_id = self._get_agent_id(agent_name)
            self._task_agents[task_id] = agent_id
            self._task_names[task_id] = agent_name
            return agent_id, agent_name
        agent_id = self._task_agents.get(task_id, task_id)
        name = self._task_names.get(task_id, task_id)
        return agent_id, name

    def _ensure_spawned(
        self,
        agent_id: str,
        name: str,
        model: str = "unknown",
        role: str = "",
        tools: list[str] | None = None,
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
                    "a2a_protocol": True,
                },
            ))

    # ── A2A Task Lifecycle ─────────────────────────────────────────────

    def on_task_created(
        self,
        task_id: str,
        agent_name: str = "a2a_agent",
        *,
        model: str = "unknown",
        role: str = "",
        tools: list[str] | None = None,
    ) -> None:
        """
        Trace an A2A task creation (tasks/send or tasks/sendSubscribe).

        Maps to: agent.spawned
        """
        agent_id = self._get_agent_id(agent_name)
        self._task_agents[task_id] = agent_id
        self._task_names[task_id] = agent_name
        self._task_start_times[task_id] = time.time()
        self._ensure_spawned(agent_id, agent_name, model, role, tools)

    def on_task_status_changed(
        self,
        task_id: str,
        status: str,
        *,
        agent_name: str | None = None,
        message: str = "",
    ) -> None:
        """
        Trace an A2A task status transition.

        Maps to:
            submitted  → agent.spawned
            working    → turn.started
            completed  → agent.completed
            failed     → agent.failed
            canceled   → agent.paused
            input-required → agent.paused
        """
        agent_id, name = self._resolve_agent(task_id, agent_name)
        event_type = _STATUS_MAP.get(status)

        if not event_type:
            logger.warning("Unknown A2A task status: %s", status)
            return

        if event_type == "agent.spawned":
            self._ensure_spawned(agent_id, name)
            return

        if event_type == "turn.started":
            turn = self._next_turn(agent_id)
            self._emit(make_event(
                self.swarm_id, agent_id, "turn.started",
                {
                    "turn_number": turn,
                    "input": message[:300] if message else f"A2A task {task_id} working",
                    "input_tokens": 0,
                    "a2a_task_id": task_id,
                    "a2a_status": status,
                },
            ))
            return

        if event_type == "agent.completed":
            duration_ms = (time.time() - self._task_start_times.get(task_id, time.time())) * 1000
            self._emit(make_event(
                self.swarm_id, agent_id, "agent.completed",
                {
                    "total_cost_usd": self._costs.get(agent_id, 0.0),
                    "total_turns": self._turn_counts.get(agent_id, 0),
                    "duration_ms": round(duration_ms, 1),
                    "output": message[:500] if message else "",
                    "a2a_task_id": task_id,
                    "a2a_status": status,
                },
            ))
            return

        if event_type == "agent.failed":
            duration_ms = (time.time() - self._task_start_times.get(task_id, time.time())) * 1000
            self._emit(make_event(
                self.swarm_id, agent_id, "agent.failed",
                {
                    "error": message[:500] if message else f"A2A task {task_id} failed",
                    "duration_ms": round(duration_ms, 1),
                    "total_cost_usd": self._costs.get(agent_id, 0.0),
                    "total_turns": self._turn_counts.get(agent_id, 0),
                    "a2a_task_id": task_id,
                    "a2a_status": status,
                },
                severity="error",
            ))
            return

        if event_type == "agent.paused":
            self._emit(make_event(
                self.swarm_id, agent_id, "agent.paused",
                {
                    "reason": f"A2A task {status}: {message}" if message else f"A2A task {status}",
                    "a2a_task_id": task_id,
                    "a2a_status": status,
                },
            ))
            return

    # ── A2A Messages ───────────────────────────────────────────────────

    def on_message(
        self,
        task_id: str,
        role: str,
        content: str,
        *,
        agent_name: str | None = None,
    ) -> None:
        """
        Trace an A2A message (user→agent or agent→user).

        Maps to:
            role="user"  → turn.started (with input)
            role="agent" → turn.completed (with output)
        """
        agent_id, name = self._resolve_agent(task_id, agent_name)

        if role == "user":
            turn = self._next_turn(agent_id)
            self._emit(make_event(
                self.swarm_id, agent_id, "turn.started",
                {
                    "turn_number": turn,
                    "input": content[:300],
                    "input_tokens": 0,
                    "a2a_task_id": task_id,
                    "a2a_role": role,
                },
            ))
        elif role == "agent":
            turn = self._turn_counts.get(agent_id, 1)
            self._emit(make_event(
                self.swarm_id, agent_id, "turn.completed",
                {
                    "turn_number": turn,
                    "output": content[:500],
                    "duration_ms": 0,
                    "output_tokens": 0,
                    "a2a_task_id": task_id,
                    "a2a_role": role,
                },
            ))
        else:
            logger.warning("Unknown A2A message role: %s", role)

    def on_streaming_update(
        self,
        task_id: str,
        content: str,
        *,
        agent_name: str | None = None,
    ) -> None:
        """
        Trace an A2A streaming/SSE update (from tasks/sendSubscribe).

        Maps to: turn.thinking
        """
        agent_id, name = self._resolve_agent(task_id, agent_name)
        turn = self._turn_counts.get(agent_id, 1)

        self._emit(make_event(
            self.swarm_id, agent_id, "turn.thinking",
            {
                "turn_number": turn,
                "thought": content[:500],
                "a2a_task_id": task_id,
            },
        ))

    # ── A2A Artifacts ──────────────────────────────────────────────────

    def on_artifact(
        self,
        task_id: str,
        *,
        artifact_type: str = "unknown",
        name: str = "",
        description: str = "",
        agent_name: str | None = None,
    ) -> None:
        """
        Trace an A2A artifact production.

        Maps to: turn.observed
        """
        agent_id, agent_label = self._resolve_agent(task_id, agent_name)
        turn = self._turn_counts.get(agent_id, 1)

        self._emit(make_event(
            self.swarm_id, agent_id, "turn.observed",
            {
                "turn_number": turn,
                "tool_name": f"a2a_artifact:{artifact_type}",
                "tool_output_summary": f"{name}: {description}"[:500] if name else description[:500],
                "duration_ms": 0,
                "a2a_task_id": task_id,
                "a2a_artifact_type": artifact_type,
            },
        ))

    # ── A2A Push Notifications (Agent-to-Agent handoff) ────────────────

    def on_push_notification(
        self,
        task_id: str,
        source_agent: str,
        target_agent: str,
        *,
        reason: str = "",
    ) -> None:
        """
        Trace an A2A push notification (agent delegating to another agent).

        Maps to: handoff.initiated + handoff.accepted
        """
        source_id = self._get_agent_id(source_agent)
        target_id = self._get_agent_id(target_agent)

        self._emit(make_event(
            self.swarm_id, source_id, "handoff.initiated",
            {
                "source_agent_id": source_id,
                "target_agent_id": target_id,
                "reason": reason or f"A2A push notification for task {task_id}",
                "a2a_task_id": task_id,
            },
        ))

        self._emit(make_event(
            self.swarm_id, target_id, "handoff.accepted",
            {
                "source_agent_id": source_id,
                "target_agent_id": target_id,
                "a2a_task_id": task_id,
            },
        ))

    # ── Cost Tracking ──────────────────────────────────────────────────

    def emit_cost(
        self,
        task_id: str,
        model: str,
        input_tokens: int,
        output_tokens: int,
        cost_usd: float,
        *,
        agent_name: str | None = None,
    ) -> None:
        """Emit a cost event for an A2A task."""
        agent_id, _ = self._resolve_agent(task_id, agent_name)
        cumulative = self._add_cost(agent_id, cost_usd)

        self._emit(make_event(
            self.swarm_id, agent_id, "cost.tokens",
            {
                "model": model,
                "input_tokens": input_tokens,
                "output_tokens": output_tokens,
                "cost_usd": cost_usd,
                "cumulative_cost_usd": cumulative,
                "a2a_task_id": task_id,
            },
        ))

    # ── Decorator: trace_task ──────────────────────────────────────────

    def trace_task(
        self,
        agent_name: str,
        *,
        model: str = "unknown",
        role: str = "",
        tools: list[str] | None = None,
    ) -> Callable:
        """
        Decorator that wraps an A2A task handler with full lifecycle tracing.

        The decorated function receives a task dict and should return a task dict.
        Sutures automatically traces: task creation, working, completion/failure.

        Usage:
            @adapter.trace_task("researcher", model="gpt-4o")
            async def handle_task(task: dict) -> dict:
                # task["id"], task["message"], etc.
                result = await do_work(task)
                return result
        """
        adapter = self

        def decorator(fn: Callable) -> Callable:
            if inspect.iscoroutinefunction(fn):
                @wraps(fn)
                async def async_wrapper(task: dict, *args: Any, **kwargs: Any) -> Any:
                    task_id = _extract_task_id(task)

                    # Task created + working
                    adapter.on_task_created(task_id, agent_name, model=model, role=role, tools=tools)
                    adapter.on_task_status_changed(task_id, "working")

                    # Extract input message if present
                    input_msg = _extract_message_content(task)
                    if input_msg:
                        adapter.on_message(task_id, "user", input_msg)

                    start = time.time()
                    try:
                        result = await fn(task, *args, **kwargs)
                        duration_ms = (time.time() - start) * 1000

                        # Extract output from result
                        output_msg = ""
                        if isinstance(result, dict):
                            output_msg = _extract_message_content(result)
                            # Trace any artifacts
                            for artifact in result.get("artifacts", []):
                                adapter.on_artifact(
                                    task_id,
                                    artifact_type=artifact.get("type", "unknown"),
                                    name=artifact.get("name", ""),
                                    description=str(artifact.get("description", "")),
                                )
                        elif result is not None:
                            output_msg = str(result)[:500]

                        if output_msg:
                            adapter.on_message(task_id, "agent", output_msg)

                        adapter.on_task_status_changed(
                            task_id, "completed", message=output_msg[:500]
                        )
                        return result
                    except Exception as exc:
                        adapter.on_task_status_changed(
                            task_id, "failed", message=str(exc)[:500]
                        )
                        raise

                return async_wrapper
            else:
                @wraps(fn)
                def sync_wrapper(task: dict, *args: Any, **kwargs: Any) -> Any:
                    task_id = _extract_task_id(task)

                    adapter.on_task_created(task_id, agent_name, model=model, role=role, tools=tools)
                    adapter.on_task_status_changed(task_id, "working")

                    input_msg = _extract_message_content(task)
                    if input_msg:
                        adapter.on_message(task_id, "user", input_msg)

                    start = time.time()
                    try:
                        result = fn(task, *args, **kwargs)
                        duration_ms = (time.time() - start) * 1000

                        output_msg = ""
                        if isinstance(result, dict):
                            output_msg = _extract_message_content(result)
                            for artifact in result.get("artifacts", []):
                                adapter.on_artifact(
                                    task_id,
                                    artifact_type=artifact.get("type", "unknown"),
                                    name=artifact.get("name", ""),
                                    description=str(artifact.get("description", "")),
                                )
                        elif result is not None:
                            output_msg = str(result)[:500]

                        if output_msg:
                            adapter.on_message(task_id, "agent", output_msg)

                        adapter.on_task_status_changed(
                            task_id, "completed", message=output_msg[:500]
                        )
                        return result
                    except Exception as exc:
                        adapter.on_task_status_changed(
                            task_id, "failed", message=str(exc)[:500]
                        )
                        raise

                return sync_wrapper

        return decorator

    # ── Middleware: wrap_handler ────────────────────────────────────────

    def wrap_handler(
        self,
        handler: Callable,
        agent_name: str = "a2a_agent",
        *,
        model: str = "unknown",
    ) -> Callable:
        """
        Wrap an A2A server handler function to automatically trace all tasks.

        Returns a new handler with the same signature that traces lifecycle events.

        Usage:
            async def my_handler(request: dict) -> dict:
                ...

            traced_handler = adapter.wrap_handler(my_handler, "my_agent")
        """
        return self.trace_task(agent_name, model=model)(handler)

    # ── Manual Emission ────────────────────────────────────────────────

    def emit(self, agent_name: str, event_type: str, data: dict[str, Any]) -> None:
        """
        Manually emit any event type.

        Usage:
            adapter.emit("researcher", "memory.write", {"key": "findings", "value": "..."})
        """
        agent_id = self._get_agent_id(agent_name)
        self._emit(make_event(self.swarm_id, agent_id, event_type, data))

    # ── Trace incoming A2A JSON-RPC requests ───────────────────────────

    def trace_jsonrpc(self, request: dict[str, Any]) -> None:
        """
        Trace a raw A2A JSON-RPC request. Call this from your A2A server's
        request handler to automatically detect and trace A2A methods.

        Handles: tasks/send, tasks/sendSubscribe, tasks/get, tasks/cancel

        Usage:
            @app.post("/a2a")
            async def handle(request: dict):
                adapter.trace_jsonrpc(request)
                return await process(request)
        """
        method = request.get("method", "")
        params = request.get("params", {})
        task_id = params.get("id") or params.get("taskId") or str(uuid.uuid4())[:8]

        if method in ("tasks/send", "tasks/sendSubscribe"):
            agent_name = params.get("agentName", "a2a_agent")
            self.on_task_created(task_id, agent_name)
            msg = _extract_message_content(params)
            if msg:
                self.on_message(task_id, "user", msg)

        elif method == "tasks/get":
            # Read-only, just note it
            pass

        elif method == "tasks/cancel":
            self.on_task_status_changed(task_id, "canceled")


# ── Helpers ────────────────────────────────────────────────────────────


def _extract_task_id(task: dict[str, Any]) -> str:
    """Extract task ID from an A2A task dict, supporting multiple formats."""
    return str(
        task.get("id")
        or task.get("taskId")
        or task.get("task_id")
        or uuid.uuid4()
    )[:64]


def _extract_message_content(obj: dict[str, Any]) -> str:
    """Extract message text content from an A2A task or message object."""
    # Direct message field
    if "message" in obj:
        msg = obj["message"]
        if isinstance(msg, str):
            return msg[:500]
        if isinstance(msg, dict):
            # A2A Message has parts
            parts = msg.get("parts", [])
            texts = []
            for part in parts:
                if isinstance(part, str):
                    texts.append(part)
                elif isinstance(part, dict) and part.get("type") == "text":
                    texts.append(part.get("text", ""))
            if texts:
                return " ".join(texts)[:500]
            # Fallback to content field
            if "content" in msg:
                return str(msg["content"])[:500]
            if "text" in msg:
                return str(msg["text"])[:500]

    # Direct content field
    if "content" in obj:
        return str(obj["content"])[:500]

    # Input field
    if "input" in obj:
        return str(obj["input"])[:500]

    return ""
