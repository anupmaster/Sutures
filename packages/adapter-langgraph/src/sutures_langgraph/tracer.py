"""
SuturesTracer — LangChain BaseCallbackHandler that converts LangChain callbacks
to Sutures AgentEvent emissions.

This is the "3 lines of code" integration:

    from sutures_langgraph import SuturesTracer
    tracer = SuturesTracer(agent_name="my-agent")
    result = await graph.ainvoke(input, config={"callbacks": [tracer]})

Works standalone (without the full adapter) for basic tracing without breakpoints.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import time
import traceback
from typing import Any
from uuid import uuid4

from langchain_core.callbacks import AsyncCallbackHandler
from langchain_core.messages import BaseMessage
from langchain_core.outputs import LLMResult

from sutures_langgraph.cost import CostCalculator
from sutures_langgraph.events import (
    AgentEvent,
    _now_iso,
    _uuid7,
    agent_completed,
    agent_failed,
    agent_spawned,
    cost_api_call,
    cost_tokens,
    turn_acting,
    turn_completed,
    turn_failed,
    turn_observed,
    turn_started,
    turn_thinking,
    turn_thought,
)
from sutures_langgraph.ws_client import SuturesWSClient

logger = logging.getLogger("sutures.tracer")


class SuturesTracer(AsyncCallbackHandler):
    """LangChain async callback handler that emits Sutures AgentEvents.

    Translates LangChain callback lifecycle into the Sutures 32-event protocol.
    Connects to the Sutures collector via WebSocket for real-time streaming.

    Can be used standalone (without SuturesLangGraphAdapter) for basic tracing.
    """

    name = "SuturesTracer"

    def __init__(
        self,
        agent_name: str = "default",
        agent_id: str | None = None,
        swarm_id: str | None = None,
        parent_agent_id: str | None = None,
        model: str = "unknown",
        tools: list[str] | None = None,
        system_prompt: str | None = None,
        ws_client: SuturesWSClient | None = None,
        collector_url: str = "ws://localhost:9470/v1/events",
        auto_connect: bool = True,
        custom_pricing: dict[str, Any] | None = None,
    ) -> None:
        super().__init__()
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

        # WebSocket client (shared or owned)
        self._ws_client = ws_client or SuturesWSClient(url=collector_url)
        self._owns_ws = ws_client is None
        self._auto_connect = auto_connect
        self._connected = False

        # Cost tracking
        self._cost_calculator = CostCalculator(custom_pricing)

        # Turn tracking
        self._turn_number = 0
        self._turn_start_time: float = 0.0
        self._turn_input_tokens = 0
        self._turn_output_tokens = 0
        self._total_tokens = 0
        self._total_turns = 0

        # Lifecycle tracking
        self._spawned = False
        self._run_start_time: float = 0.0

    @property
    def agent_id(self) -> str:
        return self._agent_id

    @property
    def swarm_id(self) -> str:
        return self._swarm_id

    @property
    def cost_calculator(self) -> CostCalculator:
        return self._cost_calculator

    async def _ensure_connected(self) -> None:
        """Connect to the collector if not already connected."""
        if not self._connected and self._auto_connect:
            await self._ws_client.connect()
            self._connected = True

    async def _emit(self, event: AgentEvent) -> None:
        """Send an event to the collector."""
        await self._ensure_connected()
        await self._ws_client.send_event(event.to_dict())

    # --- LangChain Callback Methods ---

    async def on_chain_start(
        self,
        serialized: dict[str, Any],
        inputs: dict[str, Any],
        *,
        run_id: Any = None,
        parent_run_id: Any = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        """Called when a chain (graph) starts."""
        if not self._spawned:
            self._spawned = True
            self._run_start_time = time.monotonic()
            await self._emit(agent_spawned(
                self._swarm_id,
                self._agent_id,
                name=self._agent_name,
                role=serialized.get("name", "agent"),
                model=self._model,
                tools=self._tools,
                system_prompt_hash=self._system_prompt_hash,
                parent_agent_id=self._parent_agent_id,
            ))

    async def on_chain_end(
        self,
        outputs: dict[str, Any],
        *,
        run_id: Any = None,
        parent_run_id: Any = None,
        tags: list[str] | None = None,
        **kwargs: Any,
    ) -> None:
        """Called when the chain completes."""
        # Only emit agent.completed for top-level chain (no parent)
        if parent_run_id is None and self._spawned:
            result_summary = _summarize(outputs, max_len=300)
            await self._emit(agent_completed(
                self._swarm_id,
                self._agent_id,
                result_summary=result_summary,
                total_turns=self._total_turns,
                total_tokens=self._total_tokens,
                total_cost_usd=self._cost_calculator.cumulative_cost_usd,
            ))

    async def on_chain_error(
        self,
        error: BaseException,
        *,
        run_id: Any = None,
        parent_run_id: Any = None,
        tags: list[str] | None = None,
        **kwargs: Any,
    ) -> None:
        """Called when the chain errors."""
        if parent_run_id is None:
            await self._emit(agent_failed(
                self._swarm_id,
                self._agent_id,
                error_type=type(error).__name__,
                error_message=str(error)[:500],
                stack_trace=traceback.format_exc()[:2000],
                recoverable=False,
            ))

    async def on_llm_start(
        self,
        serialized: dict[str, Any],
        prompts: list[str],
        *,
        run_id: Any = None,
        parent_run_id: Any = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        """Called when an LLM call starts."""
        self._turn_number += 1
        self._turn_start_time = time.monotonic()
        self._turn_input_tokens = 0
        self._turn_output_tokens = 0

        model_name = (
            serialized.get("kwargs", {}).get("model_name")
            or serialized.get("name", self._model)
        )

        input_summary = _summarize(prompts[0] if prompts else "", max_len=300)
        await self._emit(turn_started(
            self._swarm_id,
            self._agent_id,
            turn_number=self._turn_number,
            input_summary=input_summary,
        ))
        await self._emit(turn_thinking(
            self._swarm_id,
            self._agent_id,
            turn_number=self._turn_number,
            model=model_name,
        ))

    async def on_chat_model_start(
        self,
        serialized: dict[str, Any],
        messages: list[list[BaseMessage]],
        *,
        run_id: Any = None,
        parent_run_id: Any = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        """Called when a chat model starts (preferred over on_llm_start for chat models)."""
        self._turn_number += 1
        self._turn_start_time = time.monotonic()
        self._turn_input_tokens = 0
        self._turn_output_tokens = 0

        model_name = (
            serialized.get("kwargs", {}).get("model_name")
            or serialized.get("kwargs", {}).get("model")
            or serialized.get("name", self._model)
        )
        self._model = model_name  # Update model for cost calculation

        flat_messages = messages[0] if messages else []
        input_summary = _summarize_messages(flat_messages, max_len=300)

        await self._emit(turn_started(
            self._swarm_id,
            self._agent_id,
            turn_number=self._turn_number,
            input_summary=input_summary,
        ))
        await self._emit(turn_thinking(
            self._swarm_id,
            self._agent_id,
            turn_number=self._turn_number,
            model=model_name,
        ))

    async def on_llm_end(
        self,
        response: LLMResult,
        *,
        run_id: Any = None,
        parent_run_id: Any = None,
        tags: list[str] | None = None,
        **kwargs: Any,
    ) -> None:
        """Called when an LLM call completes."""
        duration_ms = (time.monotonic() - self._turn_start_time) * 1000

        # Extract token usage
        usage = response.llm_output or {}
        if isinstance(usage, dict):
            token_usage = usage.get("token_usage", usage.get("usage", {}))
            if isinstance(token_usage, dict):
                input_tokens = token_usage.get("prompt_tokens", 0) or 0
                output_tokens = token_usage.get("completion_tokens", 0) or 0
            else:
                input_tokens = 0
                output_tokens = 0
        else:
            input_tokens = 0
            output_tokens = 0

        total_tokens = input_tokens + output_tokens
        self._turn_input_tokens = input_tokens
        self._turn_output_tokens = output_tokens
        self._total_tokens += total_tokens
        self._total_turns += 1

        # Extract output text
        output_text = ""
        if response.generations:
            gen = response.generations[0]
            if gen:
                output_text = gen[0].text if gen[0].text else ""
                # Check for tool calls in the message
                msg = getattr(gen[0], "message", None)
                if msg and hasattr(msg, "content"):
                    output_text = str(msg.content) if msg.content else output_text

        await self._emit(turn_thought(
            self._swarm_id,
            self._agent_id,
            turn_number=self._turn_number,
            reasoning_summary=_summarize(output_text, max_len=300),
        ))

        # Cost tracking
        cost_result = self._cost_calculator.calculate(
            self._model, input_tokens, output_tokens
        )
        await self._emit(cost_tokens(
            self._swarm_id,
            self._agent_id,
            **cost_result.to_dict(),
        ))

        await self._emit(turn_completed(
            self._swarm_id,
            self._agent_id,
            turn_number=self._turn_number,
            output_summary=_summarize(output_text, max_len=300),
            output_tokens=output_tokens,
            total_tokens=total_tokens,
            duration_ms=round(duration_ms, 2),
        ))

    async def on_llm_error(
        self,
        error: BaseException,
        *,
        run_id: Any = None,
        parent_run_id: Any = None,
        tags: list[str] | None = None,
        **kwargs: Any,
    ) -> None:
        """Called when an LLM call errors."""
        await self._emit(turn_failed(
            self._swarm_id,
            self._agent_id,
            turn_number=self._turn_number,
            error_type=type(error).__name__,
            error_message=str(error)[:500],
            recoverable=True,
        ))

    async def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        *,
        run_id: Any = None,
        parent_run_id: Any = None,
        tags: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        **kwargs: Any,
    ) -> None:
        """Called when a tool starts executing."""
        tool_name = serialized.get("name", "unknown_tool")
        await self._emit(turn_acting(
            self._swarm_id,
            self._agent_id,
            turn_number=self._turn_number,
            tool_name=tool_name,
            tool_input_summary=_summarize(input_str, max_len=300),
        ))

    async def on_tool_end(
        self,
        output: str,
        *,
        run_id: Any = None,
        parent_run_id: Any = None,
        tags: list[str] | None = None,
        **kwargs: Any,
    ) -> None:
        """Called when a tool completes."""
        await self._emit(turn_observed(
            self._swarm_id,
            self._agent_id,
            turn_number=self._turn_number,
            tool_name=kwargs.get("name", "unknown_tool"),
            tool_output_summary=_summarize(str(output), max_len=500),
        ))

    async def on_tool_error(
        self,
        error: BaseException,
        *,
        run_id: Any = None,
        parent_run_id: Any = None,
        tags: list[str] | None = None,
        **kwargs: Any,
    ) -> None:
        """Called when a tool errors."""
        await self._emit(turn_failed(
            self._swarm_id,
            self._agent_id,
            turn_number=self._turn_number,
            error_type=type(error).__name__,
            error_message=str(error)[:500],
            recoverable=True,
        ))

    async def shutdown(self) -> None:
        """Gracefully shut down the tracer and disconnect."""
        if self._owns_ws:
            await self._ws_client.disconnect()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _summarize(text: Any, max_len: int = 300) -> str:
    """Truncate text to max_len characters."""
    s = str(text) if text else ""
    if len(s) <= max_len:
        return s
    return s[: max_len - 3] + "..."


def _summarize_messages(messages: list[BaseMessage], max_len: int = 300) -> str:
    """Create a brief summary of a message list."""
    if not messages:
        return ""
    parts: list[str] = []
    for msg in messages[-3:]:  # Only summarize last 3 messages
        role = getattr(msg, "type", "unknown")
        content = str(getattr(msg, "content", ""))[:100]
        parts.append(f"[{role}] {content}")
    summary = " | ".join(parts)
    return summary[:max_len]
