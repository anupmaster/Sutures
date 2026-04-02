# What is Sutures?

**Sutures** is the live intervention and MCP-native operating system for multi-agent swarms. It lets you pause any agent, see exactly what it sees in its context window, inject fixes, fork reality — then let Claude or Cursor debug your swarm through Sutures itself.

> "Breakpoints for AI Agents" — See what your agents see. Fix what they break. Ship what works.

## The Problem

Multi-agent AI systems are becoming the standard architecture for complex tasks. But when agents collaborate, things break in ways that are nearly impossible to debug:

- **Invisible context windows** — You cannot see what an agent is actually reasoning about. When it hallucinates or goes off-track, you only find out after the damage is done.
- **Shared memory corruption** — Agents read and write to shared state. Stale data, conflicting writes, and lost updates are the #1 cause of swarm failures.
- **Cascading failures** — One bad agent decision propagates through handoffs, corrupting downstream agents.
- **No intervention point** — Once an agent starts, you cannot pause it, inspect its state, or correct its course.
- **Post-mortem only** — Existing tools (Langfuse, LangSmith, AgentOps) show you what happened after the run. Sutures lets you act while it is happening.

## 7 Validated Market Gaps

| Gap | Status Quo |
|---|---|
| Live breakpoint intervention (pause/inject/resume) | Zero productized tools exist |
| Framework-agnostic visual topology | LangGraph time-travel is framework-locked |
| MCP server for agent debugging | Honeycomb/Datadog have MCP for infra, none for agents |
| Agent memory/context window visualization | Zero debug tools despite 20K+ stars on claude-mem |
| Collaborative live debugging | Replay.io proved the category, none for agents |
| Trace-level A/B diff | Testing teams need regression detection, zero tools |
| AI root cause analysis | AgenTracer academic model, no product |

## How Sutures is Different

| Tool | What it Does | What it Misses |
|---|---|---|
| VS Code Agent Inspector | Shows the graph | No intervention — view only |
| Langfuse | Post-hoc traces | No live debugging |
| LangSmith | Closed-source traces | LangChain-locked, no pause |
| AgentOps | SaaS replay | No pause/inject/resume |
| **Sutures** | **Live breakpoints, memory debugging, MCP-native, fork & replay** | **Open-source, framework-agnostic** |

## Core Capabilities

### 1. Live Breakpoints
Set conditions (tool call, cost threshold, memory conflict) and pause any agent mid-execution. Inspect its full state, inject corrections, then resume.

### 2. Memory Debugging
Visualize the three-tier memory hierarchy (STM/MTM/LTM), context window pressure, shared memory maps with staleness detection, and memory conflict alerts.

### 3. Fork & Replay
Save checkpoints at any point. Fork execution to try different approaches. Replay from any checkpoint with modified parameters.

### 4. MCP Native
18 tools accessible from Claude Code, Cursor, or any MCP client. Your AI IDE can debug your AI agents.

### 5. Framework Agnostic
Works with LangGraph, CrewAI, OpenAI Agents SDK, or any custom framework. Integration takes 3 lines of code.

### 6. Real-Time Dashboard
Topology canvas with auto-layout, swim-lane timeline, cost tracking, anomaly detection — all updating live via WebSocket.

## Brand Family

Sutures is part of a tool family:
- **Scalpel** — Codebase surgery
- **Sutures** — Agent tracing and intervention
