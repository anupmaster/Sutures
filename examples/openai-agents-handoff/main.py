"""
Sutures Example -- OpenAI Agents SDK with Handoffs
====================================================

A multi-agent system using the OpenAI Agents SDK where a Triage agent
routes questions to a Researcher or a Coder, instrumented with Sutures.

Prerequisites:
  1. Start Sutures:         npx sutures
  2. Set your API key:      export OPENAI_API_KEY=sk-...
  3. Install dependencies:  pip install -r requirements.txt
  4. Run this script:       python main.py
  5. Open dashboard:        http://localhost:9472

The Sutures adapter captures:
  - Agent spawns with instructions and handoff targets
  - Full run lifecycle (turn.started -> turn.completed)
  - Tool calls within each agent
  - Handoffs between agents (triage -> researcher / coder)
  - Token costs extracted from the run result
"""

import asyncio
import os
import sys

# ── Validate environment ──────────────────────────────────────────────
api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    print("ERROR: Set OPENAI_API_KEY to run this example.")
    print("  export OPENAI_API_KEY=sk-...")
    sys.exit(1)

from agents import Agent, Runner, handoff, function_tool

# ── Import the Sutures OpenAI adapter ─────────────────────────────────
from sutures_openai import SuturesOpenAIAdapter

COLLECTOR_URL = "ws://localhost:9470/v1/events"


# ── Define tools ──────────────────────────────────────────────────────

@function_tool
def search_papers(query: str) -> str:
    """Search academic papers on a topic."""
    return f"Found 5 papers matching '{query}': [MemoryOS, G-Memory, FluxMem, HiMem, H-MEM]"


@function_tool
def write_code(description: str) -> str:
    """Write code based on a description."""
    return f"```python\n# Code for: {description}\ndef solution():\n    pass\n```"


# ── Define agents ─────────────────────────────────────────────────────
# The Researcher handles knowledge questions.
researcher = Agent(
    name="Researcher",
    instructions=(
        "You are a research specialist. Use the search_papers tool to find "
        "relevant academic work, then summarize your findings clearly."
    ),
    model="gpt-4o-mini",
    tools=[search_papers],
)

# The Coder handles implementation questions.
coder = Agent(
    name="Coder",
    instructions=(
        "You are a coding specialist. Use the write_code tool to produce "
        "clean, well-documented Python code for the user's request."
    ),
    model="gpt-4o-mini",
    tools=[write_code],
)

# The Triage agent decides who should handle each request.
# It uses handoffs to route to the appropriate specialist.
triage_agent = Agent(
    name="Triage",
    instructions=(
        "You are a triage agent. Read the user's question and decide:\n"
        "- If it's a knowledge/research question, hand off to Researcher.\n"
        "- If it's a coding/implementation question, hand off to Coder.\n"
        "Always hand off. Never answer directly."
    ),
    model="gpt-4o-mini",
    handoffs=[
        handoff(agent=researcher, description="For research and knowledge questions"),
        handoff(agent=coder, description="For coding and implementation questions"),
    ],
)


async def main():
    print("=" * 60)
    print("  SUTURES EXAMPLE -- OpenAI Agents SDK Handoffs")
    print("=" * 60)
    print()
    print("  Agents:    Triage -> Researcher | Coder")
    print("  Model:     gpt-4o-mini")
    print("  Dashboard: http://localhost:9472")
    print()

    # ── Create the Sutures adapter ────────────────────────────────────
    adapter = SuturesOpenAIAdapter(collector_url=COLLECTOR_URL)
    await adapter.connect()

    # instrument_agent() recursively instruments the triage agent
    # AND all its handoff targets (Researcher, Coder).
    adapter.instrument_agent(triage_agent)

    # ── Run 1: A research question (should route to Researcher) ───────
    print("Question 1: 'What are the latest memory architectures for agents?'")
    print("  Expected route: Triage -> Researcher\n")

    result1 = await adapter.trace_run(
        Runner.run,
        triage_agent,
        "What are the latest memory architectures for multi-agent systems?",
    )
    print(f"  Answer: {result1.final_output[:200]}...\n")

    # Emit the handoff explicitly for topology visualization
    adapter.emit_handoff("Triage", "Researcher", reason="Research question detected")

    # ── Run 2: A coding question (should route to Coder) ──────────────
    print("Question 2: 'Write a Python function to merge agent memories'")
    print("  Expected route: Triage -> Coder\n")

    result2 = await adapter.trace_run(
        Runner.run,
        triage_agent,
        "Write a Python function that merges two agent memory stores",
    )
    print(f"  Answer: {result2.final_output[:200]}...\n")

    # Emit the handoff for this run
    adapter.emit_handoff("Triage", "Coder", reason="Coding question detected")

    # ── Done ──────────────────────────────────────────────────────────
    await adapter.close()

    print("=" * 60)
    print("  Check http://localhost:9472 for the full trace!")
    print("  You should see: Triage -> Researcher and Triage -> Coder")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
