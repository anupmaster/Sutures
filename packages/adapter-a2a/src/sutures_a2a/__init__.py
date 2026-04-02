"""
sutures-a2a — Google A2A protocol adapter for Sutures.

Breakpoints for AI Agents: trace A2A (Agent-to-Agent) protocol messages
with live debugging, conditional breakpoints, and real-time event streaming.

Quick start:

    from sutures_a2a import SuturesA2AAdapter

    adapter = SuturesA2AAdapter()
    await adapter.connect()

    @adapter.trace_task("researcher", model="gpt-4o")
    async def handle_task(task: dict) -> dict:
        ...
"""

from sutures_a2a.adapter import SuturesA2AAdapter
from sutures_a2a.events import AgentEvent, PROTOCOL_VERSION

__all__ = [
    "SuturesA2AAdapter",
    "AgentEvent",
    "PROTOCOL_VERSION",
]

__version__ = "0.1.0a1"
