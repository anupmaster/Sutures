"""
Sutures Example -- LangGraph Research Swarm
=============================================

A 3-agent LangGraph graph (Researcher -> Critic -> Writer) that researches
a topic, critiques the findings, and writes a summary -- all instrumented
with Sutures for live debugging via the SuturesTracer callback.

Prerequisites:
  1. Start Sutures:         npx sutures
  2. Set your API key:      export OPENAI_API_KEY=sk-...
  3. Install dependencies:  pip install -r requirements.txt
  4. Run this script:       python main.py
  5. Open dashboard:        http://localhost:9472

The SuturesTracer hooks into LangGraph's callback system to automatically
capture node execution, tool calls, token usage, and state transitions.
"""

import asyncio
import os
import sys
from typing import Annotated, TypedDict

from dotenv import load_dotenv

load_dotenv()

# ── Validate environment ──────────────────────────────────────────────
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    print("ERROR: Set OPENAI_API_KEY to run this example.")
    print("  export OPENAI_API_KEY=sk-...")
    print()
    print("Or create a .env file in this directory:")
    print("  OPENAI_API_KEY=sk-...")
    sys.exit(1)

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage, AIMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.checkpoint.memory import MemorySaver

# ── Import the Sutures LangGraph tracer ───────────────────────────────
from sutures_langgraph import SuturesTracer

COLLECTOR_URL = "ws://localhost:9470/v1/events"

# ── Configuration ─────────────────────────────────────────────────────
MODEL = "gpt-4o-mini"  # cheap and fast for demo; change to "gpt-4o" for better quality
TOPIC = "How hierarchical memory architectures improve multi-agent AI systems in 2026"


# ══════════════════════════════════════════════════════════════════════
# State definition
# ══════════════════════════════════════════════════════════════════════
class ResearchState(TypedDict):
    messages: Annotated[list, add_messages]
    research: str
    critique: str
    final_report: str
    turn_count: int


# ── LLM ───────────────────────────────────────────────────────────────
llm = ChatOpenAI(model=MODEL, temperature=0.7)


# ══════════════════════════════════════════════════════════════════════
# Agent nodes -- each node is a function that takes state and returns updates
# ══════════════════════════════════════════════════════════════════════

async def researcher(state: ResearchState) -> dict:
    """Researches the given topic and produces findings."""
    messages = [
        SystemMessage(content=(
            "You are an expert AI researcher. Research the given topic thoroughly. "
            "Provide 3-5 key findings with specific details and paper references. "
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
            "Score it 1-10 on accuracy, depth, recency, and practical value. "
            "Give specific feedback. Max 200 words."
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
            "You are an elite technical writer. Using the research and critique, "
            "write a polished 200-word executive summary. Address the critic's "
            "feedback. Make it compelling and actionable."
        )),
        HumanMessage(content=(
            f"Research:\n{research}\n\nCritique:\n{critique}\n\n"
            "Write the final executive summary."
        )),
    ]
    response = await llm.ainvoke(messages)
    return {
        "messages": [AIMessage(content=f"[Writer] {response.content}")],
        "final_report": response.content,
        "turn_count": state.get("turn_count", 0) + 1,
    }


# ══════════════════════════════════════════════════════════════════════
# Build the graph
# ══════════════════════════════════════════════════════════════════════

def build_graph():
    builder = StateGraph(ResearchState)

    builder.add_node("researcher", researcher)
    builder.add_node("critic", critic)
    builder.add_node("writer", writer)

    # Linear flow: researcher -> critic -> writer
    builder.add_edge(START, "researcher")
    builder.add_edge("researcher", "critic")
    builder.add_edge("critic", "writer")
    builder.add_edge("writer", END)

    checkpointer = MemorySaver()
    return builder.compile(checkpointer=checkpointer)


# ══════════════════════════════════════════════════════════════════════
# Main
# ══════════════════════════════════════════════════════════════════════

async def main():
    print("=" * 60)
    print("  SUTURES EXAMPLE -- LangGraph Research Swarm")
    print("=" * 60)
    print(f"\n  Topic: {TOPIC}")
    print(f"  Model: {MODEL}")
    print(f"  Dashboard: http://localhost:9472")
    print()

    # ── Create the Sutures tracer ─────────────────────────────────────
    # The tracer is a LangGraph callback that streams events to the
    # Sutures collector over WebSocket. Just pass it in the config.
    tracer = SuturesTracer(
        endpoint=f"{COLLECTOR_URL}",
        swarm_name="Research Swarm",
    )

    # Build the graph
    graph = build_graph()

    # ── Run with Sutures tracing ──────────────────────────────────────
    print("Running swarm with Sutures tracing...\n")

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

    # ── Print results ─────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  RESULTS")
    print("=" * 60)

    print(f"\n  Total turns: {result['turn_count']}")

    print(f"\n{'_' * 40}")
    print("  RESEARCH:")
    print(f"{'_' * 40}")
    print(result.get("research", "N/A")[:500])

    print(f"\n{'_' * 40}")
    print("  CRITIQUE:")
    print(f"{'_' * 40}")
    print(result.get("critique", "N/A")[:500])

    print(f"\n{'_' * 40}")
    print("  FINAL REPORT:")
    print(f"{'_' * 40}")
    print(result.get("final_report", "N/A"))

    print(f"\n{'=' * 60}")
    print("  Check http://localhost:9472 to see the full trace!")
    print(f"{'=' * 60}\n")


if __name__ == "__main__":
    asyncio.run(main())
