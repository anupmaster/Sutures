"""Sutures adapter for OpenAI Agents SDK — breakpoints for AI agents."""

from sutures_openai.adapter import SuturesOpenAIAdapter
from sutures_openai.events import PROTOCOL_VERSION, AgentEvent

__all__ = ["SuturesOpenAIAdapter", "AgentEvent", "PROTOCOL_VERSION"]
