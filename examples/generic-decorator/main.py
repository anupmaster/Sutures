"""
Sutures Example -- Generic Adapter (No API Key Needed)
=======================================================

Demonstrates ALL three instrumentation patterns of the framework-agnostic
Sutures adapter. This example simulates agent behavior with print() and
sleep() -- no LLM API key is required.

Prerequisites:
  1. Start Sutures:         npx sutures
  2. Install dependencies:  pip install -r requirements.txt
  3. Run this script:       python main.py
  4. Open dashboard:        http://localhost:9472

Three patterns shown:
  1. @adapter.trace_agent() decorator -- automatic turn tracking
  2. adapter.agent_span() context manager -- explicit scope control
  3. adapter.emit() manual emission -- full event control
"""

import asyncio
import time

# ── Import the Sutures generic adapter ────────────────────────────────
from sutures_generic import SuturesAdapter

COLLECTOR_URL = "ws://localhost:9470/v1/events"

# ── Create the adapter (shared across all patterns) ───────────────────
adapter = SuturesAdapter(collector_url=COLLECTOR_URL)


# ══════════════════════════════════════════════════════════════════════
# PATTERN 1: @adapter.trace_agent() decorator
# ══════════════════════════════════════════════════════════════════════
# The decorator automatically emits:
#   - agent.spawned (on first call)
#   - turn.started (on every call)
#   - turn.completed or turn.failed (when the function returns/raises)

@adapter.trace_agent("Researcher", model="gpt-4o", role="research", tools=["web_search"])
def run_researcher(query: str) -> str:
    """Simulate a researcher agent processing a query."""
    print(f"    [Researcher] Searching for: {query}")
    time.sleep(0.5)  # simulate LLM latency
    return f"Found 5 papers on '{query}'"


# ══════════════════════════════════════════════════════════════════════
# PATTERN 1b: @adapter.trace_tool() decorator
# ══════════════════════════════════════════════════════════════════════
# Wraps a tool function with turn.acting / turn.observed events.
# The tool is attributed to whichever agent most recently ran.

@adapter.trace_tool("web_search")
def web_search(query: str) -> str:
    """Simulate a web search tool call."""
    print(f"    [Tool: web_search] query='{query}'")
    time.sleep(0.3)
    return f"8 results for '{query}'"


# ══════════════════════════════════════════════════════════════════════
# PATTERN 2: adapter.agent_span() context manager
# ══════════════════════════════════════════════════════════════════════
# Use when you want explicit control over the agent lifecycle.
# Emits agent.spawned on enter, agent.completed on exit.
# Set span["output"] before exiting to capture the result.

def run_analyst_with_span() -> str:
    """Simulate an analyst agent using the context manager pattern."""
    with adapter.agent_span("Analyst", model="claude-sonnet-4-20250514", role="analysis") as span:
        print("    [Analyst] Analyzing research findings...")
        time.sleep(0.5)

        # Use tool_span inside an agent_span for nested tool tracking
        with adapter.tool_span("analyze_data", agent_name="Analyst") as tool_span:
            print("    [Tool: analyze_data] Running analysis...")
            time.sleep(0.3)
            tool_span["output"] = "3 key patterns identified"

        result = "Analysis complete: memory hierarchy, conflict resolution, context pressure"
        span["output"] = result
        return result


# ══════════════════════════════════════════════════════════════════════
# PATTERN 3: adapter.emit() manual emission
# ══════════════════════════════════════════════════════════════════════
# Full control. You construct and emit each event yourself.
# Use when the decorator/context manager patterns don't fit.

def run_writer_manual() -> str:
    """Simulate a writer agent using manual event emission."""
    agent_name = "Writer"

    # Manually emit agent.spawned
    adapter.emit(agent_name, "agent.spawned", {
        "name": agent_name,
        "role": "writing",
        "model": "claude-opus-4-20250514",
        "tools": ["write_report"],
        "system_prompt_hash": "",
    })

    # Manually emit turn.started
    adapter.emit(agent_name, "turn.started", {
        "turn_number": 1,
        "input": "Write executive summary from research and analysis",
        "input_tokens": 1500,
    })

    print("    [Writer] Drafting executive summary...")
    time.sleep(0.7)

    # Manually emit turn.acting (tool call)
    adapter.emit(agent_name, "turn.acting", {
        "turn_number": 1,
        "tool_name": "write_report",
        "tool_input_summary": "outline: memory hierarchies, patterns, recommendations",
    })

    time.sleep(0.5)

    # Manually emit turn.observed (tool result)
    adapter.emit(agent_name, "turn.observed", {
        "turn_number": 1,
        "tool_name": "write_report",
        "tool_output_summary": "200-word executive summary generated",
    })

    # Manually emit turn.completed
    adapter.emit(agent_name, "turn.completed", {
        "turn_number": 1,
        "output_summary": "Executive summary: 3-tier memory approach recommended",
        "duration_ms": 1200,
        "output_tokens": 350,
    })

    # Manually emit agent.completed
    adapter.emit(agent_name, "agent.completed", {
        "total_turns": 1,
        "total_cost_usd": 0.012,
    })

    return "Executive summary: 3-tier memory approach recommended"


# ══════════════════════════════════════════════════════════════════════
# Main — runs all three patterns in sequence with handoffs + cost
# ══════════════════════════════════════════════════════════════════════

async def main():
    print("=" * 60)
    print("  SUTURES EXAMPLE -- Generic Adapter (No API Key Needed)")
    print("=" * 60)
    print()
    print("  Agents:    Researcher -> Analyst -> Writer")
    print("  Patterns:  decorator, context manager, manual emit")
    print("  Dashboard: http://localhost:9472")
    print()

    # Connect to the Sutures collector
    await adapter.connect()
    print("  Connected to Sutures collector.\n")

    # ── Pattern 1: Decorator ──────────────────────────────────────────
    print("-- Pattern 1: @trace_agent decorator --")
    result1 = run_researcher("multi-agent memory architectures 2026")
    print(f"    Result: {result1}")

    # Call a traced tool (attributed to most recent agent = Researcher)
    tool_result = web_search("hierarchical memory for agents")
    print(f"    Tool result: {tool_result}\n")

    # Emit cost for the researcher
    adapter.emit_cost("Researcher", "gpt-4o", input_tokens=500, output_tokens=200, cost_usd=0.005)

    # ── Handoff: Researcher -> Analyst ────────────────────────────────
    print("-- Handoff: Researcher -> Analyst --")
    adapter.emit_handoff("Researcher", "Analyst", reason="Research complete, ready for analysis")
    print("    Handoff emitted.\n")

    # ── Pattern 2: Context manager ────────────────────────────────────
    print("-- Pattern 2: agent_span() context manager --")
    result2 = run_analyst_with_span()
    print(f"    Result: {result2}")

    # Emit cost for the analyst
    adapter.emit_cost("Analyst", "claude-sonnet-4-20250514", input_tokens=800, output_tokens=300, cost_usd=0.007)
    print()

    # ── Handoff: Analyst -> Writer ────────────────────────────────────
    print("-- Handoff: Analyst -> Writer --")
    adapter.emit_handoff("Analyst", "Writer", reason="Analysis complete, ready for writing")
    print("    Handoff emitted.\n")

    # ── Pattern 3: Manual emission ────────────────────────────────────
    print("-- Pattern 3: Manual emit() --")
    result3 = run_writer_manual()
    print(f"    Result: {result3}")

    # Emit cost for the writer
    adapter.emit_cost("Writer", "claude-opus-4-20250514", input_tokens=1500, output_tokens=350, cost_usd=0.012)
    print()

    # ── Cleanup ───────────────────────────────────────────────────────
    await adapter.close()

    print("=" * 60)
    print("  Done! Total cost: $0.024")
    print("  Open http://localhost:9472 to see the full trace!")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
