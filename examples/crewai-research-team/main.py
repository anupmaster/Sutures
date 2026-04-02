"""
Sutures Example -- CrewAI Research Team
========================================

A 3-agent CrewAI crew (Researcher, Analyst, Writer) instrumented with
Sutures for live debugging in the dashboard.

Prerequisites:
  1. Start Sutures:         npx sutures
  2. Set your API key:      export OPENAI_API_KEY=sk-...
  3. Install dependencies:  pip install -r requirements.txt
  4. Run this script:       python main.py
  5. Open dashboard:        http://localhost:9472

The Sutures adapter automatically captures:
  - Agent spawns with roles, models, and tools
  - Task execution (turn.started / turn.completed)
  - Tool calls (turn.acting / turn.observed)
  - Handoffs between agents
  - Token costs per agent
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

from crewai import Agent, Task, Crew, Process
from crewai.tools import tool

# ── Import the Sutures CrewAI adapter ─────────────────────────────────
from sutures_crewai import SuturesCrewAIAdapter

COLLECTOR_URL = "ws://localhost:9470/v1/events"


# ── Define tools ──────────────────────────────────────────────────────
# CrewAI tools are plain functions decorated with @tool.

@tool("web_search")
def web_search(query: str) -> str:
    """Search the web for information on a topic."""
    return f"Search results for '{query}': Found 8 relevant articles on multi-agent systems."


@tool("analyze_data")
def analyze_data(text: str) -> str:
    """Analyze text data and extract key insights."""
    return f"Analysis complete. Key insight: The text discusses {len(text.split())} concepts."


@tool("write_report")
def write_report(outline: str) -> str:
    """Write a polished report from an outline."""
    return f"Report written based on outline ({len(outline)} chars). Ready for review."


# ── Define agents ─────────────────────────────────────────────────────
researcher = Agent(
    role="Researcher",
    goal="Find the latest information on multi-agent memory architectures",
    backstory="You are a senior AI researcher specializing in agent systems.",
    tools=[web_search],
    verbose=True,
)

analyst = Agent(
    role="Analyst",
    goal="Analyze research findings and identify key patterns",
    backstory="You are a data analyst who excels at finding patterns in research.",
    tools=[analyze_data],
    verbose=True,
)

writer = Agent(
    role="Writer",
    goal="Write a compelling executive summary from the analysis",
    backstory="You are a technical writer who makes complex topics accessible.",
    tools=[write_report],
    verbose=True,
)


# ── Define tasks ──────────────────────────────────────────────────────
research_task = Task(
    description="Research multi-agent memory architectures in 2026. Find 3 key papers.",
    expected_output="A list of 3 papers with summaries",
    agent=researcher,
)

analysis_task = Task(
    description="Analyze the research findings. Identify the top 3 patterns.",
    expected_output="A structured analysis with patterns and evidence",
    agent=analyst,
)

writing_task = Task(
    description="Write a 200-word executive summary combining research and analysis.",
    expected_output="A polished executive summary",
    agent=writer,
)


# ── Build and instrument the crew ─────────────────────────────────────
crew = Crew(
    agents=[researcher, analyst, writer],
    tasks=[research_task, analysis_task, writing_task],
    process=Process.sequential,  # researcher -> analyst -> writer
    verbose=True,
)


def main():
    print("=" * 60)
    print("  SUTURES EXAMPLE -- CrewAI Research Team")
    print("=" * 60)
    print()
    print("  Agents:    Researcher, Analyst, Writer")
    print("  Process:   Sequential (research -> analyze -> write)")
    print("  Dashboard: http://localhost:9472")
    print()

    # Create and connect the Sutures adapter
    adapter = SuturesCrewAIAdapter(collector_url=COLLECTOR_URL)

    # instrument_crew() wraps the crew's kickoff method to emit events.
    # After this call, every agent spawn, task execution, and tool call
    # is automatically streamed to the Sutures collector.
    adapter.instrument_crew(crew)

    # Manually emit handoffs so the topology shows the flow
    # (CrewAI sequential process = implicit handoffs between tasks)
    print("Running crew with Sutures tracing...\n")
    result = crew.kickoff()

    # Emit handoff events to visualize the agent pipeline
    adapter.emit_handoff("Researcher", "Analyst", reason="Research complete")
    adapter.emit_handoff("Analyst", "Writer", reason="Analysis complete")

    # Emit cost events (normally extracted from LLM responses)
    adapter.emit_tool_result("Researcher", "web_search", "Found 8 articles", cost_usd=0.003)
    adapter.emit_tool_result("Analyst", "analyze_data", "Identified 3 patterns", cost_usd=0.005)
    adapter.emit_tool_result("Writer", "write_report", "200-word summary", cost_usd=0.008)

    print("\n" + "=" * 60)
    print("  RESULT")
    print("=" * 60)
    print(f"\n{result}\n")
    print("  Check http://localhost:9472 for the full trace!")
    print("=" * 60)


if __name__ == "__main__":
    main()
