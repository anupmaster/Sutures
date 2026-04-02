# Getting Started

Sutures is a live debugging and intervention tool for multi-agent AI systems. This guide walks you through installation, starting the server, and connecting your first agent swarm.

## Prerequisites

- **Node.js** >= 20.0.0
- **pnpm** >= 9.0.0 (recommended) or npm

## Installation

### From the monorepo (development)

```bash
git clone https://github.com/anupmaster/sutures.git
cd sutures
pnpm install
pnpm build
```

### Quick launch

```bash
npx sutures start
```

This starts both the **Collector server** and the **Dashboard UI**, then opens `http://localhost:9472` in your browser.

### Launch with demo simulation

```bash
npx sutures start --demo
```

The `--demo` flag runs a built-in 3-agent research swarm simulation so you can see the dashboard in action immediately.

## Default Ports

| Service | Port | Protocol |
|---|---|---|
| WebSocket (adapters + dashboard) | `9470` | `ws://` |
| HTTP REST API | `9471` | `http://` |
| Dashboard UI | `9472` | `http://` |

Ports are configurable via environment variables:

```bash
SUTURES_WS_PORT=9470
SUTURES_HTTP_PORT=9471
SUTURES_UI_PORT=9472
SUTURES_CHECKPOINT_DB=sutures_checkpoints.db
SUTURES_OTEL_ENABLED=false
```

## CLI Commands

```bash
sutures start           # Start collector + dashboard + open browser
sutures start --demo    # Start everything + run demo simulation
sutures collector       # Start collector server only
sutures dashboard       # Start dashboard UI only
sutures mcp             # Start MCP server (stdio transport)
sutures version         # Show version
sutures help            # Show help
```

## Architecture Overview

```
Your Agent System (LangGraph / CrewAI / OpenAI Agents / Any)
        |  Framework Adapter (3 lines of code)
        v
    WebSocket (ws://localhost:9470)
        v
SUTURES COLLECTOR SERVER
   |-- Event Router + Ring Buffer (10K events)
   |-- Checkpoint Store (SQLite)
   |-- Breakpoint Controller (13 condition types)
   |-- Anomaly Engine (loop/cost/bloat/cycle detection)
        |                              |
        v                              v
SUTURES MCP SERVER              SUTURES DASHBOARD
18 tools for Claude Code/       Topology + Inspector +
Cursor / Codex                  Memory + Timeline + Cost
```

## Next Steps

- [Quick Start (3 Lines)](/guide/quick-start) — Instrument your agent system
- [Event Protocol](/guide/event-protocol) — Understand the 32 event types
- [Breakpoints](/guide/breakpoints) — Set up pause/inject/resume
- [MCP Integration](/guide/mcp-integration) — Let Claude Code debug your agents
