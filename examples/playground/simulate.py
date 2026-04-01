"""
Sutures Playground — Zero-Dependency Simulator (NO API KEY NEEDED)
=====================================================================

Sends realistic multi-agent events directly to the Sutures collector
via WebSocket. No LLM calls, no API keys, no dependencies beyond websockets.

This is the fastest way to see the dashboard in action.

Usage:
  1. Start collector:    node packages/collector/dist/index.js
  2. Start dashboard:    npx next start apps/dashboard -p 9472
  3. Run this:           python examples/playground/simulate.py
  4. Open:               http://localhost:9472
"""

import asyncio
import json
import uuid
import time
from datetime import datetime, timezone

try:
    import websockets
except ImportError:
    print("Installing websockets...")
    import subprocess
    subprocess.check_call(["pip", "install", "websockets"])
    import websockets


COLLECTOR_URL = "ws://localhost:9470/v1/events"
SWARM_ID = str(uuid.uuid4())


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def make_event(event_type: str, agent_id: str, data: dict, severity: str = "info"):
    return {
        "type": "event",
        "payload": {
            "event_id": str(uuid.uuid4()),
            "swarm_id": SWARM_ID,
            "agent_id": agent_id,
            "timestamp": now_iso(),
            "event_type": event_type,
            "severity": severity,
            "data": data,
            "protocol_version": "1.0.0",
        },
    }


async def simulate():
    print("=" * 55)
    print("  SUTURES SIMULATOR — No API Key Required")
    print("=" * 55)
    print(f"\n  Swarm ID:  {SWARM_ID[:8]}...")
    print(f"  Agents:    Researcher, Critic, Writer")
    print(f"  Dashboard: http://localhost:9472\n")

    try:
        ws = await websockets.connect(COLLECTOR_URL, open_timeout=5)
    except (ConnectionRefusedError, OSError):
        print("ERROR: Collector not running!")
        print("  Start it first: node packages/collector/dist/index.js")
        return

    async def send(event):
        await ws.send(json.dumps(event))
        await asyncio.sleep(0.05)  # small delay for realism

    print("▶ Spawning agents...")

    # ── Spawn 3 agents ──
    await send(make_event("agent.spawned", "researcher", {
        "name": "Researcher",
        "role": "research",
        "model": "claude-sonnet-4-20250514",
        "tools": ["web_search", "arxiv_search", "read_paper"],
        "system_prompt_hash": "sha256:abc123",
    }))

    await asyncio.sleep(0.3)

    await send(make_event("agent.spawned", "critic", {
        "name": "Critic",
        "role": "critique",
        "model": "claude-sonnet-4-20250514",
        "tools": ["evaluate", "score"],
        "system_prompt_hash": "sha256:def456",
    }))

    await asyncio.sleep(0.3)

    await send(make_event("agent.spawned", "writer", {
        "name": "Writer",
        "role": "writing",
        "model": "claude-opus-4-20250514",
        "tools": ["write_document", "format_markdown"],
        "system_prompt_hash": "sha256:ghi789",
    }))

    await asyncio.sleep(1)

    # ── Researcher: 3 research turns ──
    tools = ["web_search", "arxiv_search", "read_paper"]
    tool_inputs = [
        'query: "multi-agent memory 2026"',
        'query: "G-Memory NeurIPS 2025"',
        'paper_id: arxiv:2506.07398',
    ]
    tool_outputs = [
        "Found 12 results on hierarchical memory architectures...",
        "G-Memory: 3-tier graph (Insight/Query/Interaction), NeurIPS spotlight...",
        "Full paper: G-Memory proposes organizational memory theory for MAS...",
    ]

    for turn in range(1, 4):
        print(f"  🔍 Researcher turn {turn}...")

        await send(make_event("turn.started", "researcher", {
            "turn_number": turn,
            "input": f"Research multi-agent memory architectures — focus on {['hierarchical storage tiers', 'conflict resolution strategies', 'context window optimization'][turn - 1]}",
            "input_tokens": 150 + turn * 50,
        }))
        await asyncio.sleep(0.5)

        thinking_content = [
            "I need to search for recent papers on multi-agent memory architectures. Let me start with a broad web search to find the latest work.",
            "The web search found several promising leads. Let me check arXiv for the G-Memory and MemoryOS papers specifically.",
            "I found the key papers. Let me read the full MemoryOS paper to understand their 3-tier hierarchy (STM/MTM/LTM).",
        ]
        await send(make_event("turn.thinking", "researcher", {
            "turn_number": turn,
            "model": "claude-sonnet-4-20250514",
            "content": thinking_content[turn - 1],
            "prompt_tokens": 200 + turn * 100,
        }, "debug"))
        await asyncio.sleep(0.8)

        await send(make_event("turn.acting", "researcher", {
            "turn_number": turn,
            "tool_name": tools[turn - 1],
            "tool_input_summary": tool_inputs[turn - 1],
        }))
        await asyncio.sleep(1.2)

        await send(make_event("turn.observed", "researcher", {
            "turn_number": turn,
            "tool_name": tools[turn - 1],
            "tool_output_summary": tool_outputs[turn - 1],
            "output_tokens": 300 + turn * 150,
        }))
        await asyncio.sleep(0.3)

        await send(make_event("cost.tokens", "researcher", {
            "model": "claude-sonnet-4-20250514",
            "input_tokens": 200 + turn * 100,
            "output_tokens": 300 + turn * 150,
            "total_tokens": 500 + turn * 250,
            "cost_usd": round(0.003 * turn, 4),
            "cumulative_cost_usd": round(0.003 * turn * (turn + 1) / 2, 4),
        }))

        await send(make_event("turn.completed", "researcher", {
            "turn_number": turn,
            "output_summary": f"Research turn {turn}: key insights on memory architectures",
            "output_tokens": 300 + turn * 150,
            "total_tokens": 500 + turn * 250,
            "duration_ms": 2500 + turn * 500,
        }))
        await asyncio.sleep(0.5)

    # ── Handoff: Researcher → Critic ──
    print("  🤝 Handoff: Researcher → Critic")

    await send(make_event("handoff.initiated", "researcher", {
        "source_agent_id": "researcher",
        "target_agent_id": "critic",
        "reason": "Research complete, needs quality evaluation",
        "payload_summary": "3 papers analyzed, 5 key findings on memory hierarchies",
    }))
    await asyncio.sleep(0.5)

    await send(make_event("handoff.accepted", "critic", {
        "source_agent_id": "researcher",
        "target_agent_id": "critic",
        "handoff_id": "handoff-1",
    }))
    await asyncio.sleep(0.8)

    # ── Critic: 1 evaluation turn ──
    print("  🔎 Critic evaluating...")

    await send(make_event("turn.started", "critic", {
        "turn_number": 1,
        "input": "Evaluate the research output from Researcher: 3 papers on multi-agent memory architectures. Score on relevance, depth, recency, and citation quality.",
        "input_tokens": 800,
    }))
    await asyncio.sleep(0.5)

    await send(make_event("turn.thinking", "critic", {
        "turn_number": 1,
        "model": "claude-sonnet-4-20250514",
        "content": "Let me evaluate the research findings. The papers cover MemoryOS (3-tier hierarchy), G-Memory (graph-based shared memory), and FluxMem (dynamic structure switching). I need to check coverage, recency, and whether practical implementation details are included.",
        "prompt_tokens": 1200,
    }, "debug"))
    await asyncio.sleep(1.5)

    await send(make_event("turn.acting", "critic", {
        "turn_number": 1,
        "tool_name": "evaluate",
        "tool_input_summary": "Scoring on relevance, depth, recency, citation quality",
    }))
    await asyncio.sleep(0.8)

    await send(make_event("turn.observed", "critic", {
        "turn_number": 1,
        "tool_name": "evaluate",
        "tool_output_summary": "Score: 8.5/10. Strong recency, needs more practical examples.",
        "output_tokens": 450,
    }))
    await asyncio.sleep(0.3)

    await send(make_event("cost.tokens", "critic", {
        "model": "claude-sonnet-4-20250514",
        "input_tokens": 1200,
        "output_tokens": 450,
        "total_tokens": 1650,
        "cost_usd": 0.008,
        "cumulative_cost_usd": 0.008,
    }))

    await send(make_event("turn.completed", "critic", {
        "turn_number": 1,
        "output_summary": "Approved 8.5/10 — strong research, add practical examples",
        "output_tokens": 450,
        "total_tokens": 1650,
        "duration_ms": 3500,
    }))
    await asyncio.sleep(0.5)

    # ── Handoff: Critic → Writer ──
    print("  🤝 Handoff: Critic → Writer")

    await send(make_event("handoff.initiated", "critic", {
        "source_agent_id": "critic",
        "target_agent_id": "writer",
        "reason": "Research approved, ready for writing",
        "payload_summary": "Research + critique (8.5/10), add practical examples",
    }))
    await asyncio.sleep(0.5)

    await send(make_event("handoff.accepted", "writer", {
        "source_agent_id": "critic",
        "target_agent_id": "writer",
        "handoff_id": "handoff-2",
    }))
    await asyncio.sleep(0.8)

    # ── Writer: 1 writing turn ──
    print("  ✍️  Writer generating report...")

    await send(make_event("turn.started", "writer", {
        "turn_number": 1,
        "input": "Write a comprehensive 2000-word report on multi-agent memory architectures. Include the 3-tier hierarchy from MemoryOS, G-Memory's graph approach, and FluxMem's dynamic switching. Add code examples.",
        "input_tokens": 2000,
    }))
    await asyncio.sleep(0.5)

    await send(make_event("turn.thinking", "writer", {
        "turn_number": 1,
        "model": "claude-opus-4-20250514",
        "content": "I'll structure this report with: 1) Introduction to the memory problem in multi-agent systems, 2) MemoryOS 3-tier architecture (STM/MTM/LTM), 3) G-Memory graph-based shared memory, 4) FluxMem dynamic structure switching, 5) Practical implementation patterns with code examples, 6) Comparison table and recommendations.",
        "prompt_tokens": 2500,
    }, "debug"))
    await asyncio.sleep(2.0)

    await send(make_event("turn.acting", "writer", {
        "turn_number": 1,
        "tool_name": "write_document",
        "tool_input_summary": "Writing 2000-word report with intro, hierarchy, examples, conclusion",
    }))
    await asyncio.sleep(2.0)

    await send(make_event("turn.observed", "writer", {
        "turn_number": 1,
        "tool_name": "write_document",
        "tool_output_summary": "Generated 2,150 word report with code examples",
        "output_tokens": 3200,
    }))
    await asyncio.sleep(0.3)

    await send(make_event("cost.tokens", "writer", {
        "model": "claude-opus-4-20250514",
        "input_tokens": 2500,
        "output_tokens": 3200,
        "total_tokens": 5700,
        "cost_usd": 0.278,
        "cumulative_cost_usd": 0.278,
    }))

    await send(make_event("turn.completed", "writer", {
        "turn_number": 1,
        "output_summary": "Report complete: Multi-Agent Memory Architectures in 2026 — 2,150 words",
        "output_tokens": 3200,
        "total_tokens": 5700,
        "duration_ms": 5000,
    }))

    await asyncio.sleep(0.5)

    # ── Complete all agents ──
    print("\n  ✅ Completing agents...")

    await send(make_event("agent.completed", "researcher", {
        "result_summary": "Analyzed 3 papers on memory hierarchies",
        "total_turns": 3,
        "total_tokens": 2250,
        "total_cost_usd": 0.018,
    }))
    await asyncio.sleep(0.2)

    await send(make_event("agent.completed", "critic", {
        "result_summary": "Approved research with 8.5/10 score",
        "total_turns": 1,
        "total_tokens": 1650,
        "total_cost_usd": 0.008,
    }))
    await asyncio.sleep(0.2)

    await send(make_event("agent.completed", "writer", {
        "result_summary": "Generated 2,150 word report",
        "total_turns": 1,
        "total_tokens": 5700,
        "total_cost_usd": 0.278,
    }))

    await ws.close()

    print(f"\n{'=' * 55}")
    print(f"  DONE! Total cost: $0.304")
    print(f"  Open http://localhost:9472 to see the full trace")
    print(f"{'=' * 55}\n")


if __name__ == "__main__":
    asyncio.run(simulate())
