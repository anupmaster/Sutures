"""
Example: A2A Task Agent with Sutures tracing.

This demonstrates how to use the sutures-a2a adapter to trace
Google A2A protocol messages through the Sutures dashboard.

Run the Sutures collector first:
    npx sutures

Then run this example:
    pip install sutures-a2a aiohttp
    python main.py

Open http://localhost:9472 to see the live topology.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid

from aiohttp import web

from sutures_a2a import SuturesA2AAdapter

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── Initialize Sutures adapter ────────────────────────────────────────

adapter = SuturesA2AAdapter(swarm_id="a2a-demo")


# ── A2A Agent Card (served at /.well-known/agent.json) ────────────────

AGENT_CARD = {
    "name": "Research Agent",
    "description": "A demo research agent that summarizes topics using A2A protocol",
    "url": "http://localhost:8080",
    "version": "1.0.0",
    "capabilities": {
        "streaming": True,
        "pushNotifications": False,
    },
    "skills": [
        {
            "id": "research",
            "name": "Research",
            "description": "Research and summarize a topic",
        }
    ],
}


# ── Task handler (decorated with Sutures tracing) ─────────────────────


@adapter.trace_task("research_agent", model="gpt-4o-mini", role="researcher")
async def handle_research_task(task: dict) -> dict:
    """
    Handle an A2A task. The @trace_task decorator automatically emits:
    - agent.spawned (on first call)
    - turn.started (task working)
    - turn.completed (agent response)
    - agent.completed / agent.failed (task done)
    """
    # Simulate some work
    await asyncio.sleep(1.0)

    # Simulate a streaming thought (visible in Sutures timeline)
    adapter.on_streaming_update(
        task["id"],
        "Searching for information on the requested topic...",
    )
    await asyncio.sleep(0.5)

    adapter.on_streaming_update(
        task["id"],
        "Found 3 relevant sources, synthesizing...",
    )
    await asyncio.sleep(0.5)

    # Produce an artifact
    adapter.on_artifact(
        task["id"],
        artifact_type="text",
        name="research_summary",
        description="A comprehensive summary of the research findings.",
    )

    # Track cost
    adapter.emit_cost(
        task["id"],
        model="gpt-4o-mini",
        input_tokens=1500,
        output_tokens=800,
        cost_usd=0.003,
    )

    return {
        "id": task["id"],
        "status": {"state": "completed"},
        "message": {
            "role": "agent",
            "parts": [{"type": "text", "text": "Here is your research summary: ..."}],
        },
        "artifacts": [
            {
                "type": "text",
                "name": "summary.md",
                "description": "Research summary in markdown format",
            }
        ],
    }


# ── A2A JSON-RPC Server ───────────────────────────────────────────────


async def handle_agent_card(request: web.Request) -> web.Response:
    """Serve the A2A Agent Card."""
    return web.json_response(AGENT_CARD)


async def handle_a2a(request: web.Request) -> web.Response:
    """Handle A2A JSON-RPC requests."""
    body = await request.json()
    method = body.get("method", "")
    params = body.get("params", {})
    rpc_id = body.get("id", 1)

    # Trace the raw JSON-RPC request
    adapter.trace_jsonrpc(body)

    if method == "tasks/send":
        task_id = params.get("id") or str(uuid.uuid4())
        task = {"id": task_id, **params}

        try:
            result = await handle_research_task(task)
            return web.json_response({
                "jsonrpc": "2.0",
                "id": rpc_id,
                "result": result,
            })
        except Exception as e:
            return web.json_response({
                "jsonrpc": "2.0",
                "id": rpc_id,
                "error": {"code": -32000, "message": str(e)},
            })

    elif method == "tasks/get":
        return web.json_response({
            "jsonrpc": "2.0",
            "id": rpc_id,
            "result": {"id": params.get("id"), "status": {"state": "completed"}},
        })

    elif method == "tasks/cancel":
        return web.json_response({
            "jsonrpc": "2.0",
            "id": rpc_id,
            "result": {"id": params.get("id"), "status": {"state": "canceled"}},
        })

    return web.json_response({
        "jsonrpc": "2.0",
        "id": rpc_id,
        "error": {"code": -32601, "message": f"Method not found: {method}"},
    })


# ── Multi-agent demo (simulates two A2A agents) ───────────────────────


async def run_multi_agent_demo() -> None:
    """Simulate a multi-agent A2A interaction for the Sutures dashboard."""
    logger.info("Running multi-agent A2A demo...")

    # Agent 1: Coordinator
    adapter.on_task_created("task-001", "coordinator", model="gpt-4o", role="orchestrator")
    adapter.on_task_status_changed("task-001", "working")
    adapter.on_message("task-001", "user", "Research and summarize quantum computing advances in 2026")

    await asyncio.sleep(0.5)

    # Coordinator delegates to researcher via push notification
    adapter.on_task_created("task-002", "researcher", model="gpt-4o-mini", role="researcher")
    adapter.on_push_notification(
        "task-002",
        source_agent="coordinator",
        target_agent="researcher",
        reason="Delegating research subtask",
    )
    adapter.on_task_status_changed("task-002", "working")

    await asyncio.sleep(1.0)

    # Researcher streams thoughts
    adapter.on_streaming_update("task-002", "Querying knowledge base for quantum computing papers...")
    await asyncio.sleep(0.3)
    adapter.on_streaming_update("task-002", "Found 12 relevant papers from 2026...")
    await asyncio.sleep(0.3)

    # Researcher produces artifact
    adapter.on_artifact(
        "task-002",
        artifact_type="text",
        name="quantum_research.md",
        description="Summary of 12 quantum computing papers from 2026",
    )

    # Researcher completes
    adapter.on_message("task-002", "agent", "Research complete. Found 12 papers covering...")
    adapter.on_task_status_changed("task-002", "completed", message="Research complete")
    adapter.emit_cost("task-002", "gpt-4o-mini", 3000, 1200, 0.005)

    await asyncio.sleep(0.5)

    # Coordinator receives result and completes
    adapter.on_message("task-001", "agent", "Here is the comprehensive summary of quantum computing in 2026...")
    adapter.on_task_status_changed("task-001", "completed", message="Summary delivered")
    adapter.emit_cost("task-001", "gpt-4o", 2000, 500, 0.015)

    logger.info("Multi-agent demo complete! Check http://localhost:9472")


# ── Main ───────────────────────────────────────────────────────────────


async def main() -> None:
    await adapter.connect()

    # Run the multi-agent demo first
    await run_multi_agent_demo()

    # Then start the A2A server
    app = web.Application()
    app.router.add_get("/.well-known/agent.json", handle_agent_card)
    app.router.add_post("/a2a", handle_a2a)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "localhost", 8080)
    await site.start()

    logger.info("A2A agent running at http://localhost:8080")
    logger.info("Agent card: http://localhost:8080/.well-known/agent.json")
    logger.info("Sutures dashboard: http://localhost:9472")

    # Keep running
    try:
        await asyncio.Event().wait()
    except KeyboardInterrupt:
        pass
    finally:
        await adapter.close()
        await runner.cleanup()


if __name__ == "__main__":
    asyncio.run(main())
