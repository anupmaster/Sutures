"""
Sutures Playground — Real LangGraph Multi-Agent Research Swarm
================================================================

A 3-agent system that researches a topic, critiques the research,
and writes a summary — all instrumented with Sutures for live debugging.

Usage:
  1. Start the Sutures collector:     node packages/collector/dist/index.js
  2. Start the Sutures dashboard:     npx next start apps/dashboard -p 9472
  3. Run this script:                 python examples/playground/research_swarm.py

  Open http://localhost:9472 to watch the agents in real-time!

Requirements:
  pip install -r examples/playground/requirements.txt

  Set your API key:
    export OPENAI_API_KEY=sk-...          (for OpenAI)
    OR
    export ANTHROPIC_API_KEY=sk-ant-...   (for Claude)

  This demo uses OpenAI by default since it's simpler to set up.
  Change MODEL below to use Claude instead.
"""

import asyncio
import os
import sys
from typing import Annotated, TypedDict
from dotenv import load_dotenv

load_dotenv()

# ── Check for API key ──
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    print("ERROR: Set OPENAI_API_KEY environment variable")
    print("  export OPENAI_API_KEY=sk-...")
    print("\nOr create examples/playground/.env with:")
    print("  OPENAI_API_KEY=sk-...")
    sys.exit(1)

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver

# Add the adapter to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "../../packages/adapter-langgraph/src"))

from sutures_langgraph import SuturesTracer

# ── Configuration ──
MODEL = "gpt-4o-mini"  # cheap & fast for demo. Change to "gpt-4o" for better quality
TOPIC = "How hierarchical memory architectures improve multi-agent AI systems in 2026"

# ── State ──
class ResearchState(TypedDict):
    messages: Annotated[list, add_messages]
    research: str
    critique: str
    final_report: str
    turn_count: int


# ── LLM ──
llm = ChatOpenAI(model=MODEL, temperature=0.7)


# ── Agent nodes ──
async def researcher(state: ResearchState) -> dict:
    """Researches the given topic and produces findings."""
    messages = [
        SystemMessage(content=(
            "You are an expert AI researcher. Research the given topic thoroughly. "
            "Provide 3-5 key findings with specific details, paper references, and data points. "
            "Be concise but informative. Max 300 words."
        )),
        HumanMessage(content=f"Research this topic: {TOPIC}"),
    ]

    response = await llm.ainvoke(messages)

    return {
        "messages": [AIMessage(content=f"[Researcher] {response.content}")],
        "research": response.content,
        "turn_count": state.get("turn_count", 0) + 1,
    }


async def critic(state: ResearchState) -> dict:
    """Critiques the research for quality, accuracy, and completeness."""
    research = state.get("research", "No research provided")

    messages = [
        SystemMessage(content=(
            "You are a sharp academic critic. Evaluate the research below. "
            "Score it 1-10 on: accuracy, depth, recency, and practical value. "
            "Give specific feedback on what's strong and what needs improvement. "
            "Be honest and constructive. Max 200 words."
        )),
        HumanMessage(content=f"Evaluate this research:\n\n{research}"),
    ]

    response = await llm.ainvoke(messages)

    return {
        "messages": [AIMessage(content=f"[Critic] {response.content}")],
        "critique": response.content,
        "turn_count": state.get("turn_count", 0) + 1,
    }


async def writer(state: ResearchState) -> dict:
    """Writes a polished summary incorporating research and critique."""
    research = state.get("research", "")
    critique = state.get("critique", "")

    messages = [
        SystemMessage(content=(
            "You are an elite technical writer. Using the research and critique below, "
            "write a polished 200-word executive summary. "
            "Address the critic's feedback. Include key data points. "
            "Make it compelling and actionable."
        )),
        HumanMessage(content=(
            f"Research:\n{research}\n\n"
            f"Critique:\n{critique}\n\n"
            "Write the final executive summary."
        )),
    ]

    response = await llm.ainvoke(messages)

    return {
        "messages": [AIMessage(content=f"[Writer] {response.content}")],
        "final_report": response.content,
        "turn_count": state.get("turn_count", 0) + 1,
    }


# ── Build the graph ──
def build_graph():
    builder = StateGraph(ResearchState)

    builder.add_node("researcher", researcher)
    builder.add_node("critic", critic)
    builder.add_node("writer", writer)

    # Linear flow: researcher → critic → writer
    builder.add_edge(START, "researcher")
    builder.add_edge("researcher", "critic")
    builder.add_edge("critic", "writer")
    builder.add_edge("writer", END)

    checkpointer = MemorySaver()
    return builder.compile(checkpointer=checkpointer)


# ── Main ──
async def main():
    print("=" * 60)
    print("  SUTURES PLAYGROUND — Research Swarm Demo")
    print("=" * 60)
    print(f"\n  Topic: {TOPIC}")
    print(f"  Model: {MODEL}")
    print(f"  Dashboard: http://localhost:9472")
    print()

    # Create Sutures tracer
    tracer = SuturesTracer(
        endpoint="ws://localhost:9470/v1/events",
        swarm_name="Research Swarm",
    )

    # Build graph
    graph = build_graph()

    # Run with Sutures tracing
    print("▶ Running swarm with Sutures tracing...\n")

    config = {
        "callbacks": [tracer],
        "configurable": {"thread_id": "demo-research-1"},
    }

    result = await graph.ainvoke(
        {
            "messages": [HumanMessage(content=TOPIC)],
            "research": "",
            "critique": "",
            "final_report": "",
            "turn_count": 0,
        },
        config=config,
    )

    # Print results
    print("\n" + "=" * 60)
    print("  RESULTS")
    print("=" * 60)

    print(f"\n📊 Total turns: {result['turn_count']}")
    print(f"\n{'─' * 40}")
    print("RESEARCH:")
    print(f"{'─' * 40}")
    print(result.get("research", "N/A")[:500])

    print(f"\n{'─' * 40}")
    print("CRITIQUE:")
    print(f"{'─' * 40}")
    print(result.get("critique", "N/A")[:500])

    print(f"\n{'─' * 40}")
    print("FINAL REPORT:")
    print(f"{'─' * 40}")
    print(result.get("final_report", "N/A"))

    print(f"\n{'=' * 60}")
    print("  Check http://localhost:9472 to see the full trace!")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    asyncio.run(main())
