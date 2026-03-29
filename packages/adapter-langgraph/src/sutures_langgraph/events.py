"""
Sutures AgentEvent protocol — Python dataclasses mirroring the TypeScript core types.

All 32 event types across 7 categories, with factory functions for typed event creation.
"""

from __future__ import annotations

import os
import time
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Literal


# ---------------------------------------------------------------------------
# UUIDv7 generation (time-ordered, RFC 9562)
# ---------------------------------------------------------------------------

def _uuid7() -> str:
    """Generate a UUIDv7 (time-ordered) identifier."""
    timestamp_ms = int(time.time() * 1000)
    # 48-bit timestamp
    uuid_int = timestamp_ms << 80
    # version 7
    uuid_int |= 0x7 << 76
    # random bits for the rest
    rand_bits = int.from_bytes(os.urandom(8), "big")
    uuid_int |= (rand_bits & 0x0FFF) << 64  # 12 random bits after version
    # variant 10xx
    uuid_int |= 0x8 << 60
    uuid_int |= rand_bits >> 4 & 0x0FFF_FFFF_FFFF_FFFF  # remaining 60 bits
    return str(uuid.UUID(int=uuid_int))


def _now_iso() -> str:
    """ISO 8601 timestamp with microsecond precision."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


# ---------------------------------------------------------------------------
# Event type literals
# ---------------------------------------------------------------------------

LIFECYCLE_EVENTS: set[str] = {
    "agent.spawned", "agent.idle", "agent.completed",
    "agent.failed", "agent.paused", "agent.resumed",
}

REASONING_EVENTS: set[str] = {
    "turn.started", "turn.thinking", "turn.thought",
    "turn.acting", "turn.observed", "turn.completed", "turn.failed",
}

COLLABORATION_EVENTS: set[str] = {
    "handoff.initiated", "handoff.accepted",
    "handoff.rejected", "handoff.completed",
}

MEMORY_STATE_EVENTS: set[str] = {
    "memory.write", "memory.read", "checkpoint.created",
}

INTERVENTION_EVENTS: set[str] = {
    "breakpoint.set", "breakpoint.hit",
    "breakpoint.inject", "breakpoint.release",
}

COST_EVENTS: set[str] = {
    "cost.tokens", "cost.api_call",
}

MEMORY_EXTENSION_EVENTS: set[str] = {
    "memory.tier_migration", "memory.conflict", "memory.prune",
    "memory.reconsolidate", "memory.structure_switch", "memory.coherence_violation",
}

ALL_EVENT_TYPES: set[str] = (
    LIFECYCLE_EVENTS | REASONING_EVENTS | COLLABORATION_EVENTS
    | MEMORY_STATE_EVENTS | INTERVENTION_EVENTS | COST_EVENTS
    | MEMORY_EXTENSION_EVENTS
)

# ---------------------------------------------------------------------------
# Severity
# ---------------------------------------------------------------------------

Severity = Literal["debug", "info", "warn", "error", "critical"]

# ---------------------------------------------------------------------------
# Memory tier
# ---------------------------------------------------------------------------

MemoryTier = Literal["stm", "mtm", "ltm"]

# ---------------------------------------------------------------------------
# Breakpoint condition
# ---------------------------------------------------------------------------

BreakpointCondition = Literal[
    "always",
    "on_turn",
    "on_tool",
    "on_handoff",
    "on_cost",
    "on_error",
    "on_score",
    "on_memory_tier_migration",
    "on_conflict_detected",
    "on_context_pressure",
    "on_memory_structure_switch",
    "on_memory_link_created",
    "on_cache_coherence_violation",
]

ALL_BREAKPOINT_CONDITIONS: list[str] = [
    "always", "on_turn", "on_tool", "on_handoff", "on_cost", "on_error",
    "on_score", "on_memory_tier_migration", "on_conflict_detected",
    "on_context_pressure", "on_memory_structure_switch",
    "on_memory_link_created", "on_cache_coherence_violation",
]

PROTOCOL_VERSION = "1.0.0"


# ---------------------------------------------------------------------------
# Base event
# ---------------------------------------------------------------------------

@dataclass
class AgentEvent:
    """Base event envelope for all Sutures agent events."""

    event_id: str
    swarm_id: str
    agent_id: str
    timestamp: str
    event_type: str
    severity: Severity
    data: dict[str, Any]
    protocol_version: str = PROTOCOL_VERSION
    parent_agent_id: str | None = None
    duration_ms: float | None = None

    def to_dict(self) -> dict[str, Any]:
        """Serialize to a plain dict, dropping None values."""
        d = asdict(self)
        return {k: v for k, v in d.items() if v is not None}


# ---------------------------------------------------------------------------
# Breakpoint config
# ---------------------------------------------------------------------------

@dataclass
class BreakpointParams:
    """Optional parameters that refine a breakpoint condition."""

    tool_name: str | None = None
    max_usd: float | None = None
    threshold: float | None = None
    turn_number: int | None = None
    tier: MemoryTier | None = None
    agent_id: str | None = None


@dataclass
class BreakpointConfig:
    """A configured breakpoint rule."""

    id: str
    agent_id: str
    condition: str  # BreakpointCondition
    enabled: bool = True
    params: BreakpointParams | None = None


# ---------------------------------------------------------------------------
# Factory helpers
# ---------------------------------------------------------------------------

def _make_event(
    swarm_id: str,
    agent_id: str,
    event_type: str,
    data: dict[str, Any],
    severity: Severity = "info",
    parent_agent_id: str | None = None,
    duration_ms: float | None = None,
) -> AgentEvent:
    """Internal factory for creating an AgentEvent with auto-generated ID and timestamp."""
    return AgentEvent(
        event_id=_uuid7(),
        swarm_id=swarm_id,
        agent_id=agent_id,
        timestamp=_now_iso(),
        event_type=event_type,
        severity=severity,
        data=data,
        parent_agent_id=parent_agent_id,
        duration_ms=duration_ms,
    )


# --- Lifecycle ---

def agent_spawned(
    swarm_id: str,
    agent_id: str,
    *,
    name: str,
    role: str,
    model: str,
    tools: list[str],
    system_prompt_hash: str,
    parent_agent_id: str | None = None,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "agent.spawned", {
        "name": name, "role": role, "model": model,
        "tools": tools, "system_prompt_hash": system_prompt_hash,
        "parent_agent_id": parent_agent_id,
    }, parent_agent_id=parent_agent_id)


def agent_idle(swarm_id: str, agent_id: str, *, reason: str) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "agent.idle", {
        "reason": reason, "idle_since": _now_iso(),
    })


def agent_completed(
    swarm_id: str,
    agent_id: str,
    *,
    result_summary: str,
    total_turns: int,
    total_tokens: int,
    total_cost_usd: float,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "agent.completed", {
        "result_summary": result_summary[:300],
        "total_turns": total_turns,
        "total_tokens": total_tokens,
        "total_cost_usd": total_cost_usd,
    })


def agent_failed(
    swarm_id: str,
    agent_id: str,
    *,
    error_type: str,
    error_message: str,
    stack_trace: str | None = None,
    recoverable: bool = False,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "agent.failed", {
        "error_type": error_type,
        "error_message": error_message,
        "stack_trace": stack_trace,
        "recoverable": recoverable,
    }, severity="error")


def agent_paused(
    swarm_id: str,
    agent_id: str,
    *,
    reason: str,
    breakpoint_id: str | None = None,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "agent.paused", {
        "reason": reason,
        "breakpoint_id": breakpoint_id,
    }, severity="warn")


def agent_resumed(
    swarm_id: str,
    agent_id: str,
    *,
    resumed_by: str,
    injected_state: dict[str, Any] | None = None,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "agent.resumed", {
        "resumed_by": resumed_by,
        "injected_state": injected_state,
    })


# --- Reasoning ---

def turn_started(
    swarm_id: str,
    agent_id: str,
    *,
    turn_number: int,
    input_summary: str,
    input_tokens: int = 0,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "turn.started", {
        "turn_number": turn_number,
        "input_summary": input_summary[:300],
        "input_tokens": input_tokens,
    })


def turn_thinking(
    swarm_id: str,
    agent_id: str,
    *,
    turn_number: int,
    model: str,
    prompt_tokens: int = 0,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "turn.thinking", {
        "turn_number": turn_number,
        "model": model,
        "prompt_tokens": prompt_tokens,
    }, severity="debug")


def turn_thought(
    swarm_id: str,
    agent_id: str,
    *,
    turn_number: int,
    reasoning_summary: str,
    confidence: float | None = None,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "turn.thought", {
        "turn_number": turn_number,
        "reasoning_summary": reasoning_summary[:300],
        "confidence": confidence,
    }, severity="debug")


def turn_acting(
    swarm_id: str,
    agent_id: str,
    *,
    turn_number: int,
    tool_name: str,
    tool_input_summary: str,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "turn.acting", {
        "turn_number": turn_number,
        "tool_name": tool_name,
        "tool_input_summary": tool_input_summary[:300],
    })


def turn_observed(
    swarm_id: str,
    agent_id: str,
    *,
    turn_number: int,
    tool_name: str,
    tool_output_summary: str,
    output_tokens: int = 0,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "turn.observed", {
        "turn_number": turn_number,
        "tool_name": tool_name,
        "tool_output_summary": tool_output_summary[:500],
        "output_tokens": output_tokens,
    })


def turn_completed(
    swarm_id: str,
    agent_id: str,
    *,
    turn_number: int,
    output_summary: str,
    output_tokens: int,
    total_tokens: int,
    duration_ms: float,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "turn.completed", {
        "turn_number": turn_number,
        "output_summary": output_summary[:300],
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "duration_ms": duration_ms,
    }, duration_ms=duration_ms)


def turn_failed(
    swarm_id: str,
    agent_id: str,
    *,
    turn_number: int,
    error_type: str,
    error_message: str,
    recoverable: bool = False,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "turn.failed", {
        "turn_number": turn_number,
        "error_type": error_type,
        "error_message": error_message,
        "recoverable": recoverable,
    }, severity="error")


# --- Collaboration ---

def handoff_initiated(
    swarm_id: str,
    agent_id: str,
    *,
    source_agent_id: str,
    target_agent_id: str,
    reason: str,
    payload_summary: str,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "handoff.initiated", {
        "source_agent_id": source_agent_id,
        "target_agent_id": target_agent_id,
        "reason": reason,
        "payload_summary": payload_summary[:300],
    })


def handoff_accepted(
    swarm_id: str,
    agent_id: str,
    *,
    source_agent_id: str,
    target_agent_id: str,
    handoff_id: str,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "handoff.accepted", {
        "source_agent_id": source_agent_id,
        "target_agent_id": target_agent_id,
        "handoff_id": handoff_id,
    })


def handoff_rejected(
    swarm_id: str,
    agent_id: str,
    *,
    source_agent_id: str,
    target_agent_id: str,
    handoff_id: str,
    rejection_reason: str,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "handoff.rejected", {
        "source_agent_id": source_agent_id,
        "target_agent_id": target_agent_id,
        "handoff_id": handoff_id,
        "rejection_reason": rejection_reason,
    }, severity="warn")


def handoff_completed(
    swarm_id: str,
    agent_id: str,
    *,
    source_agent_id: str,
    target_agent_id: str,
    handoff_id: str,
    result_summary: str,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "handoff.completed", {
        "source_agent_id": source_agent_id,
        "target_agent_id": target_agent_id,
        "handoff_id": handoff_id,
        "result_summary": result_summary[:300],
    })


# --- Memory & State ---

def memory_write(
    swarm_id: str,
    agent_id: str,
    *,
    key: str,
    tier: MemoryTier,
    token_count: int,
    content_summary: str,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "memory.write", {
        "key": key, "tier": tier,
        "token_count": token_count, "content_summary": content_summary[:300],
    })


def memory_read(
    swarm_id: str,
    agent_id: str,
    *,
    key: str,
    tier: MemoryTier,
    token_count: int,
    hit: bool,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "memory.read", {
        "key": key, "tier": tier,
        "token_count": token_count, "hit": hit,
    }, severity="debug")


def checkpoint_created(
    swarm_id: str,
    agent_id: str,
    *,
    checkpoint_id: str,
    thread_id: str,
    state_summary: str,
    parent_checkpoint_id: str | None = None,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "checkpoint.created", {
        "checkpoint_id": checkpoint_id,
        "thread_id": thread_id,
        "state_summary": state_summary[:300],
        "parent_checkpoint_id": parent_checkpoint_id,
    })


# --- Intervention ---

def breakpoint_set(
    swarm_id: str,
    agent_id: str,
    *,
    breakpoint_id: str,
    condition: str,
    params: dict[str, Any] | None = None,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "breakpoint.set", {
        "breakpoint_id": breakpoint_id,
        "condition": condition,
        "params": params,
    })


def breakpoint_hit(
    swarm_id: str,
    agent_id: str,
    *,
    breakpoint_id: str,
    node_name: str,
    state_snapshot: dict[str, Any],
    reason: str,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "breakpoint.hit", {
        "breakpoint_id": breakpoint_id,
        "agent_id": agent_id,
        "node_name": node_name,
        "state_snapshot": state_snapshot,
        "reason": reason,
    }, severity="warn")


def breakpoint_inject(
    swarm_id: str,
    agent_id: str,
    *,
    target_agent_id: str,
    injection_type: Literal["append", "replace"],
    channel: str,
    content: str,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "breakpoint.inject", {
        "target_agent_id": target_agent_id,
        "injection_type": injection_type,
        "channel": channel,
        "content": content,
    })


def breakpoint_release(
    swarm_id: str,
    agent_id: str,
    *,
    breakpoint_id: str,
    released_by: str,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "breakpoint.release", {
        "breakpoint_id": breakpoint_id,
        "agent_id": agent_id,
        "released_by": released_by,
    })


# --- Cost ---

def cost_tokens(
    swarm_id: str,
    agent_id: str,
    *,
    model: str,
    input_tokens: int,
    output_tokens: int,
    total_tokens: int,
    cost_usd: float,
    cumulative_cost_usd: float,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "cost.tokens", {
        "model": model,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "cost_usd": cost_usd,
        "cumulative_cost_usd": cumulative_cost_usd,
    })


def cost_api_call(
    swarm_id: str,
    agent_id: str,
    *,
    provider: str,
    model: str,
    endpoint: str,
    status_code: int,
    latency_ms: float,
    cost_usd: float,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "cost.api_call", {
        "provider": provider,
        "model": model,
        "endpoint": endpoint,
        "status_code": status_code,
        "latency_ms": latency_ms,
        "cost_usd": cost_usd,
    })


# --- Memory Extensions ---

def memory_tier_migration(
    swarm_id: str,
    agent_id: str,
    *,
    entry_id: str,
    from_tier: MemoryTier,
    to_tier: MemoryTier,
    reason: str,
    token_count: int,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "memory.tier_migration", {
        "entry_id": entry_id,
        "from_tier": from_tier,
        "to_tier": to_tier,
        "reason": reason,
        "token_count": token_count,
    })


def memory_conflict(
    swarm_id: str,
    agent_id: str,
    *,
    entry_id: str,
    conflicting_agent_ids: list[str],
    resolution: Literal["latest_wins", "merge", "manual"],
    tier: MemoryTier,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "memory.conflict", {
        "entry_id": entry_id,
        "conflicting_agent_ids": conflicting_agent_ids,
        "resolution": resolution,
        "tier": tier,
    }, severity="warn")


def memory_prune(
    swarm_id: str,
    agent_id: str,
    *,
    tier: MemoryTier,
    entries_pruned: int,
    tokens_freed: int,
    reason: str,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "memory.prune", {
        "tier": tier,
        "entries_pruned": entries_pruned,
        "tokens_freed": tokens_freed,
        "reason": reason,
    })


def memory_reconsolidate(
    swarm_id: str,
    agent_id: str,
    *,
    tier: MemoryTier,
    entries_affected: int,
    summary: str,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "memory.reconsolidate", {
        "tier": tier,
        "entries_affected": entries_affected,
        "summary": summary[:300],
    })


def memory_structure_switch(
    swarm_id: str,
    agent_id: str,
    *,
    from_structure: str,
    to_structure: str,
    reason: str,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "memory.structure_switch", {
        "from_structure": from_structure,
        "to_structure": to_structure,
        "reason": reason,
    })


def memory_coherence_violation(
    swarm_id: str,
    agent_id: str,
    *,
    entry_id: str,
    expected_version: int,
    actual_version: int,
    tier: MemoryTier,
) -> AgentEvent:
    return _make_event(swarm_id, agent_id, "memory.coherence_violation", {
        "entry_id": entry_id,
        "agent_id": agent_id,
        "expected_version": expected_version,
        "actual_version": actual_version,
        "tier": tier,
    }, severity="error")
