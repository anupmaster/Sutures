"""
Sutures BreakpointEngine — evaluates all 13 breakpoint conditions locally
for <10ms latency. Receives breakpoint configs via WebSocket from the collector.
"""

from __future__ import annotations

import logging
from typing import Any

from sutures_langgraph.cost import CostCalculator
from sutures_langgraph.events import BreakpointConfig, BreakpointParams

logger = logging.getLogger("sutures.breakpoints")


class BreakpointEngine:
    """Local breakpoint condition evaluator.

    Maintains a set of active breakpoint configs and evaluates them against
    the current node execution context. Designed for <10ms evaluation latency.
    """

    def __init__(self, cost_calculator: CostCalculator | None = None) -> None:
        self._breakpoints: dict[str, BreakpointConfig] = {}
        self._cost_calculator = cost_calculator

    @property
    def active_count(self) -> int:
        return sum(1 for bp in self._breakpoints.values() if bp.enabled)

    def add_breakpoint(self, config: BreakpointConfig) -> None:
        """Register a breakpoint configuration."""
        self._breakpoints[config.id] = config
        logger.debug("Breakpoint added: %s (%s)", config.id, config.condition)

    def remove_breakpoint(self, breakpoint_id: str) -> bool:
        """Remove a breakpoint by ID. Returns True if it existed."""
        removed = self._breakpoints.pop(breakpoint_id, None)
        return removed is not None

    def enable_breakpoint(self, breakpoint_id: str) -> None:
        """Enable a breakpoint."""
        if bp := self._breakpoints.get(breakpoint_id):
            bp.enabled = True

    def disable_breakpoint(self, breakpoint_id: str) -> None:
        """Disable a breakpoint without removing it."""
        if bp := self._breakpoints.get(breakpoint_id):
            bp.enabled = False

    def clear_all(self) -> None:
        """Remove all breakpoints."""
        self._breakpoints.clear()

    def list_breakpoints(self) -> list[BreakpointConfig]:
        """Return all registered breakpoints."""
        return list(self._breakpoints.values())

    async def should_pause(
        self,
        phase: str,
        node_name: str,
        state: dict[str, Any],
        config: dict[str, Any] | None = None,
    ) -> BreakpointConfig | None:
        """Evaluate all active breakpoints against the current execution context.

        Returns the first matching BreakpointConfig, or None if no breakpoints fire.

        Args:
            phase: "before" or "after" the node execution.
            node_name: Name of the current LangGraph node.
            state: Current graph state dict.
            config: LangGraph RunnableConfig (may contain metadata).

        Returns:
            The matching BreakpointConfig if a breakpoint should fire, else None.
        """
        for bp in self._breakpoints.values():
            if not bp.enabled:
                continue

            # If breakpoint is scoped to a specific agent, check match
            if bp.agent_id and config:
                agent_id = _extract_agent_id(config)
                if agent_id and bp.agent_id != agent_id:
                    continue

            if self._evaluate_condition(bp, phase, node_name, state, config):
                logger.info(
                    "Breakpoint hit: %s (condition=%s, node=%s, phase=%s)",
                    bp.id, bp.condition, node_name, phase,
                )
                return bp

        return None

    def _evaluate_condition(
        self,
        bp: BreakpointConfig,
        phase: str,
        node_name: str,
        state: dict[str, Any],
        config: dict[str, Any] | None,
    ) -> bool:
        """Evaluate a single breakpoint condition. All 13 conditions handled."""
        condition = bp.condition
        params = bp.params or BreakpointParams()

        if condition == "always":
            return True

        if condition == "on_turn":
            return self._check_on_turn(state, params)

        if condition == "on_tool":
            return self._check_on_tool(node_name, state, params)

        if condition == "on_handoff":
            return self._check_on_handoff(node_name, state)

        if condition == "on_cost":
            return self._check_on_cost(params)

        if condition == "on_error":
            return self._check_on_error(state)

        if condition == "on_score":
            return self._check_on_score(state, params)

        if condition == "on_memory_tier_migration":
            return self._check_on_memory_tier_migration(state, params)

        if condition == "on_conflict_detected":
            return self._check_on_conflict(state)

        if condition == "on_context_pressure":
            return self._check_on_context_pressure(state, params)

        if condition == "on_memory_structure_switch":
            return self._check_on_memory_structure_switch(state)

        if condition == "on_memory_link_created":
            return self._check_on_memory_link_created(state)

        if condition == "on_cache_coherence_violation":
            return self._check_on_cache_coherence_violation(state)

        logger.warning("Unknown breakpoint condition: %s", condition)
        return False

    # --- Individual condition evaluators ---

    def _check_on_turn(self, state: dict[str, Any], params: BreakpointParams) -> bool:
        """Fires when turn_number matches, or on every turn if no turn_number specified."""
        messages = state.get("messages", [])
        current_turn = len(messages)
        if params.turn_number is not None:
            return current_turn >= params.turn_number
        # Fire on every turn boundary (when messages exist)
        return current_turn > 0

    def _check_on_tool(
        self, node_name: str, state: dict[str, Any], params: BreakpointParams
    ) -> bool:
        """Fires when a specific tool is about to be invoked, or any tool if unscoped."""
        # Check if this node is a tool node or if tool_calls are pending
        if params.tool_name:
            # Check if the node name matches
            if node_name == params.tool_name:
                return True
            # Check pending tool calls in messages
            return self._has_pending_tool_call(state, params.tool_name)
        # Any tool invocation
        return self._is_tool_node(node_name, state)

    def _check_on_handoff(self, node_name: str, state: dict[str, Any]) -> bool:
        """Fires when an agent handoff is detected."""
        # Detect handoff patterns: node names containing "handoff", "transfer", "route"
        handoff_indicators = {"handoff", "transfer", "route", "delegate", "send_to"}
        node_lower = node_name.lower()
        if any(indicator in node_lower for indicator in handoff_indicators):
            return True
        # Check state for handoff markers
        return bool(state.get("_handoff_target") or state.get("next_agent"))

    def _check_on_cost(self, params: BreakpointParams) -> bool:
        """Fires when cumulative cost exceeds the threshold."""
        if not self._cost_calculator or params.max_usd is None:
            return False
        return self._cost_calculator.cumulative_cost_usd >= params.max_usd

    def _check_on_error(self, state: dict[str, Any]) -> bool:
        """Fires when an error is detected in the current state."""
        # Check for error markers in state
        if state.get("error") or state.get("_error"):
            return True
        # Check last message for error tool results
        messages = state.get("messages", [])
        if messages:
            last = messages[-1]
            if hasattr(last, "type") and last.type == "tool":
                content = getattr(last, "content", "")
                if isinstance(content, str) and ("error" in content.lower()):
                    return True
        return False

    def _check_on_score(self, state: dict[str, Any], params: BreakpointParams) -> bool:
        """Fires when a confidence/quality score drops below threshold."""
        threshold = params.threshold if params.threshold is not None else 0.5
        score = state.get("confidence") or state.get("score") or state.get("quality_score")
        if score is not None:
            try:
                return float(score) < threshold
            except (ValueError, TypeError):
                pass
        return False

    def _check_on_memory_tier_migration(
        self, state: dict[str, Any], params: BreakpointParams
    ) -> bool:
        """Fires when a memory tier migration event is detected."""
        migration = state.get("_memory_tier_migration")
        if not migration:
            return False
        if params.tier:
            # Only fire for migrations involving the specified tier
            return migration.get("from_tier") == params.tier or migration.get("to_tier") == params.tier
        return True

    def _check_on_conflict(self, state: dict[str, Any]) -> bool:
        """Fires when a memory conflict is detected."""
        return bool(state.get("_memory_conflict") or state.get("_conflict_detected"))

    def _check_on_context_pressure(
        self, state: dict[str, Any], params: BreakpointParams
    ) -> bool:
        """Fires when context window pressure exceeds threshold."""
        threshold = params.threshold if params.threshold is not None else 0.8
        pressure = state.get("_context_pressure") or state.get("context_pressure_percent")
        if pressure is not None:
            try:
                return float(pressure) >= threshold
            except (ValueError, TypeError):
                pass
        # Heuristic: check message count as proxy for pressure
        messages = state.get("messages", [])
        if len(messages) > 100:  # High message count heuristic
            return True
        return False

    def _check_on_memory_structure_switch(self, state: dict[str, Any]) -> bool:
        """Fires when a memory structure switch is detected."""
        return bool(state.get("_memory_structure_switch"))

    def _check_on_memory_link_created(self, state: dict[str, Any]) -> bool:
        """Fires when a new memory link is created."""
        return bool(state.get("_memory_link_created"))

    def _check_on_cache_coherence_violation(self, state: dict[str, Any]) -> bool:
        """Fires when a cache coherence violation is detected."""
        return bool(state.get("_cache_coherence_violation") or state.get("_coherence_violation"))

    # --- Utility helpers ---

    @staticmethod
    def _has_pending_tool_call(state: dict[str, Any], tool_name: str) -> bool:
        """Check if the state has a pending tool call matching the given name."""
        messages = state.get("messages", [])
        if not messages:
            return False
        last = messages[-1]
        tool_calls = getattr(last, "tool_calls", None)
        if tool_calls:
            return any(tc.get("name") == tool_name for tc in tool_calls)
        return False

    @staticmethod
    def _is_tool_node(node_name: str, state: dict[str, Any]) -> bool:
        """Heuristic: determine if this node is a tool-execution node."""
        tool_indicators = {"tool", "action", "execute", "invoke"}
        node_lower = node_name.lower()
        if any(indicator in node_lower for indicator in tool_indicators):
            return True
        # Check for pending tool calls in the last message
        messages = state.get("messages", [])
        if messages:
            last = messages[-1]
            if getattr(last, "tool_calls", None):
                return True
        return False


def _extract_agent_id(config: dict[str, Any]) -> str | None:
    """Extract agent_id from LangGraph RunnableConfig metadata."""
    configurable = config.get("configurable", {})
    return (
        configurable.get("agent_id")
        or configurable.get("sutures_agent_id")
        or None
    )
