"""
sutures-crewai — Sutures adapter for CrewAI.

Breakpoints for AI Agents: instrument CrewAI crews with live debugging,
conditional breakpoints, and real-time event streaming.

Quick start (3 lines):

    from sutures_crewai import SuturesCrewAIAdapter
    adapter = SuturesCrewAIAdapter()
    adapter.instrument_crew(crew)
    crew.kickoff()
"""

from sutures_crewai.adapter import SuturesCrewAIAdapter
from sutures_crewai.events import AgentEvent, PROTOCOL_VERSION

__all__ = [
    "SuturesCrewAIAdapter",
    "AgentEvent",
    "PROTOCOL_VERSION",
]

__version__ = "0.1.0a1"
