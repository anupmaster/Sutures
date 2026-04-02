"""
Minimal event types for the generic adapter.
Mirrors the Sutures AgentEvent protocol v1.0.
"""

from __future__ import annotations

import os
import time
import uuid
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any, Literal

PROTOCOL_VERSION = "1.0.0"

Severity = Literal["debug", "info", "warn", "error", "critical"]


def _uuid7() -> str:
    """Generate a UUIDv7 (time-ordered) identifier per RFC 9562."""
    timestamp_ms = int(time.time() * 1000)
    rand_a = int.from_bytes(os.urandom(2), "big") & 0x0FFF
    rand_b = int.from_bytes(os.urandom(8), "big") & 0x3FFF_FFFF_FFFF_FFFF
    uuid_int = (timestamp_ms & 0xFFFF_FFFF_FFFF) << 80
    uuid_int |= 0x7 << 76
    uuid_int |= rand_a << 64
    uuid_int |= 0b10 << 62
    uuid_int |= rand_b
    return str(uuid.UUID(int=uuid_int))


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


@dataclass
class AgentEvent:
    event_id: str
    swarm_id: str
    agent_id: str
    timestamp: str
    event_type: str
    severity: Severity
    data: dict[str, Any]
    protocol_version: str = PROTOCOL_VERSION

    def to_dict(self) -> dict[str, Any]:
        d = asdict(self)
        return {k: v for k, v in d.items() if v is not None}


def make_event(
    swarm_id: str,
    agent_id: str,
    event_type: str,
    data: dict[str, Any],
    severity: Severity = "info",
) -> AgentEvent:
    return AgentEvent(
        event_id=_uuid7(),
        swarm_id=swarm_id,
        agent_id=agent_id,
        timestamp=_now_iso(),
        event_type=event_type,
        severity=severity,
        data=data,
    )
