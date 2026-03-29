"""
sutures-langgraph — Sutures adapter for LangGraph.

Breakpoints for AI Agents: instrument LangGraph graphs with live debugging,
conditional breakpoints, state injection, and real-time event streaming.

Quick start (3 lines):

    from sutures_langgraph import SuturesTracer
    tracer = SuturesTracer(agent_name="my-agent", model="gpt-4o")
    result = await graph.ainvoke(input, config={"callbacks": [tracer]})

Full breakpoint support:

    from sutures_langgraph import SuturesLangGraphAdapter
    adapter = SuturesLangGraphAdapter(agent_name="my-agent")
    graph = await adapter.instrument_graph(builder, thread_id="t1")
    await adapter.add_breakpoint("on_tool", params={"tool_name": "search"})
    async for event in adapter.run_with_breakpoints(graph, inputs, "t1"):
        print(event)
"""

from sutures_langgraph.adapter import SuturesLangGraphAdapter
from sutures_langgraph.breakpoint_engine import BreakpointEngine
from sutures_langgraph.cost import CostCalculator, CostResult, ModelPricing
from sutures_langgraph.events import (
    AgentEvent,
    BreakpointConfig,
    BreakpointParams,
    ALL_BREAKPOINT_CONDITIONS,
    ALL_EVENT_TYPES,
    PROTOCOL_VERSION,
)
from sutures_langgraph.tracer import SuturesTracer
from sutures_langgraph.ws_client import SuturesWSClient

__all__ = [
    # Primary exports
    "SuturesLangGraphAdapter",
    "SuturesTracer",
    "BreakpointEngine",
    # Supporting classes
    "SuturesWSClient",
    "CostCalculator",
    "CostResult",
    "ModelPricing",
    # Data types
    "AgentEvent",
    "BreakpointConfig",
    "BreakpointParams",
    # Constants
    "ALL_BREAKPOINT_CONDITIONS",
    "ALL_EVENT_TYPES",
    "PROTOCOL_VERSION",
]

__version__ = "0.1.0a1"
