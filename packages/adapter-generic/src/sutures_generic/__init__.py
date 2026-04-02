"""
sutures-generic — Framework-agnostic Sutures adapter.

Breakpoints for AI Agents: instrument any agent system with live debugging,
conditional breakpoints, and real-time event streaming using decorators,
context managers, or manual emission.

Quick start:

    from sutures_generic import SuturesAdapter

    adapter = SuturesAdapter()

    @adapter.trace_agent("researcher", model="gpt-4o")
    def run_researcher(query: str) -> str:
        ...

    @adapter.trace_tool("web_search")
    def web_search(query: str) -> str:
        ...
"""

from sutures_generic.adapter import SuturesAdapter
from sutures_generic.events import AgentEvent, PROTOCOL_VERSION

__all__ = [
    "SuturesAdapter",
    "AgentEvent",
    "PROTOCOL_VERSION",
]

__version__ = "0.1.0a1"
