<p align="center">
  <img src="https://raw.githubusercontent.com/anupmaster/Sutures/main/sutures.png" width="180" alt="Sutures" />
</p>

<h1 align="center">Sutures</h1>
<p align="center"><strong>Breakpoints for AI Agents</strong></p>

<p align="center">
  The first open-source, framework-agnostic visual debugger with live intervention for multi-agent systems.
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#why-sutures">Why Sutures</a> •
  <a href="#features">Features</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#adapters">Adapters</a> •
  <a href="./AGENT_EVENT_PROTOCOL.md">Protocol Spec</a>
</p>

<p align="center">
  <a href="https://github.com/anupmaster/Sutures/stargazers"><img src="https://img.shields.io/github/stars/anupmaster/Sutures?style=for-the-badge&color=f59e0b&labelColor=1c1917" alt="Stars"></a>
  <img src="https://img.shields.io/badge/license-Apache_2.0-3b82f6?style=for-the-badge&labelColor=1c1917" alt="License" />
  <img src="https://img.shields.io/badge/protocol-v1.0.0-22c55e?style=for-the-badge&labelColor=1c1917" alt="Protocol" />
  <img src="https://img.shields.io/badge/status-alpha-f97316?style=for-the-badge&labelColor=1c1917" alt="Status" />
</p>

<p align="center">
  <sub>Created by <a href="https://github.com/anupmaster"><strong>Anup Karanjkar</strong></a> &middot; 12+ years building digital products</sub>
</p>

---

> **Scalpel** cuts into your codebase. **Sutures** traces how everything connects.
>
> From the creator of [Scalpel](https://github.com/anupmaster/scalpel) — Surgical AI for your codebase.

---

## The Problem

Every multi-agent framework gives you **logs after the fact**. None let you **see, pause, and fix** a running swarm in real-time.

```
❌ Agent stuck in a loop?              → Parse 2000 lines of JSON
❌ Hallucination cascading across agents? → Restart the entire run  
❌ Cost exploding unexpectedly?          → Find out after $50 is burned
❌ Which agent broke the chain?          → Manual log archaeology
```

**89% of organizations** have implemented agent observability, but **65% still cite monitoring as their #1 challenge** (PwC 2026, Gartner). Academic research (CHI 2025, Microsoft) proved developers want breakpoints for agents — but no productized tool exists.

**Until now.**

## Quick Start

### LangGraph (Python) — 3 lines

```python
from sutures_langgraph import SuturesTracer

tracer = SuturesTracer(endpoint="ws://localhost:9470/v1/events")
result = app.invoke(input_data, config={"callbacks": [tracer]})
```

### Generic (TypeScript) — 4 lines

```typescript
import { createSutures } from '@sutures/core';

const sutures = createSutures();
await sutures.connect();
sutures.agentSpawned('researcher', { name: 'Researcher', role: 'research', model: 'claude-sonnet-4-20250514', tools: ['web_search'] });
```

### Set a Breakpoint

```python
# Pause when cost exceeds $0.50
tracer.set_breakpoint(node="*", condition="on_cost", max_usd=0.50)

# Pause on any tool call to "web_search"  
tracer.set_breakpoint(node="researcher", condition="on_tool", tool_name="web_search")

# Pause on every turn of the critic agent
tracer.set_breakpoint(node="critic", condition="always")
```

## Why Sutures

| Capability | Langfuse | LangSmith | AgentOps | AgentPrism | AutoGen Studio | **Sutures** |
|---|---|---|---|---|---|---|
| Open source | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| Framework-agnostic | ✅ | ❌ | ✅ | ✅ | ❌ | ✅ |
| Live visual topology | ❌ | ❌ | Partial | ❌ | Partial | ✅ |
| **Breakpoints** (pause/inject/resume) | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **Live intervention** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| OTEL-native | ✅ | Partial | ❌ | ✅ | ❌ | ✅ |
| Standalone tool | SaaS | SaaS | SaaS | Library | Locked | ✅ |

**Sutures is the only tool that gives you `gdb` for AI agents.**

## Features

### 🔴 Breakpoints
Set conditional breakpoints on any agent. Pause execution when:
- A specific agent runs (`on_turn`)
- A tool is called (`on_tool`)
- Cost exceeds threshold (`on_cost`)
- An error occurs (`on_error`)
- Any handoff happens (`on_handoff`)

### 💉 Live Intervention
When paused at a breakpoint:
- **Inspect** full agent state, messages, and memory
- **Inject** modified messages or tool results
- **Change** the model mid-run
- **Resume** and watch the effect

### 🌐 Live Topology
Real-time force-directed graph showing:
- Agent nodes with state indicators (thinking/acting/idle/paused/error)
- Handoff edges with active animation
- Click any agent to inspect context window and tool calls

### ⏱ Execution Timeline
Scrubber-based replay of every agent step:
- Fork from any point to test alternative paths
- Compare original vs. modified execution
- Export as shareable HTML report

### 💰 Cost Inspector
Per-agent, per-model token and dollar tracking:
- Running cumulative cost with automatic alerts
- Model-specific pricing for 6+ providers
- Cost-per-turn breakdown

### 🔌 OTEL-Native
Works alongside your existing observability stack:
- Export to Langfuse, LangSmith, Arize, Datadog, Grafana
- Standard GenAI semantic conventions
- Zero vendor lock-in

## Architecture

```
┌─────────────────────────────────────────────────┐
│            Your Multi-Agent System              │
│  (LangGraph, CrewAI, OpenAI Agents, AutoGen)    │
└───────────────┬─────────────────────────────────┘
                │  Adapter (3 lines of code)
                ▼
┌─────────────────────────────────────────────────┐
│          Sutures Collector (WebSocket)           │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Event    │  │Checkpoint│  │  Breakpoint   │  │
│  │ Buffer   │  │  Store   │  │   Engine      │  │
│  └────┬─────┘  └────┬─────┘  └──────┬───────┘  │
│       └──────────────┴───────────────┘          │
└───────────────┬─────────────────────────────────┘
                │  AgentEvent Protocol (v1.0)
                ▼
┌─────────────────────────────────────────────────┐
│           Sutures Dashboard (UI)                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐  │
│  │ Topology │  │ Timeline │  │  Breakpoint   │  │
│  │  Canvas  │  │ Scrubber │  │   Console     │  │
│  └──────────┘  └──────────┘  └──────────────┘  │
│  ┌──────────┐  ┌──────────┐                     │
│  │   Cost   │  │  Agent   │                     │
│  │Inspector │  │Inspector │                     │
│  └──────────┘  └──────────┘                     │
└─────────────────────────────────────────────────┘
                │  Optional: OTEL export
                ▼
        Langfuse / LangSmith / Arize / Datadog
```

## AgentEvent Protocol

Sutures defines an open protocol — **26 event types** across 6 categories:

| Category | Events | Purpose |
|---|---|---|
| **Lifecycle** | `agent.spawned`, `.idle`, `.completed`, `.failed`, `.paused`, `.resumed` | Track agent state |
| **Reasoning** | `turn.thinking`, `.thought`, `.acting`, `.observed`, `.completed`, `.failed` | Trace LLM inference + tool calls |
| **Collaboration** | `handoff.initiated`, `.accepted`, `.rejected`, `.completed` | Map agent-to-agent communication |
| **Memory** | `memory.write`, `.read`, `checkpoint.created` | Track shared state |
| **Intervention** | `breakpoint.set`, `.hit`, `.inject`, `.release` | Enable live debugging |
| **Cost** | `cost.tokens`, `.api_call` | Track spend |

Full spec: [`AGENT_EVENT_PROTOCOL.md`](./AGENT_EVENT_PROTOCOL.md)

## Adapters

| Adapter | Framework | Status | Install |
|---|---|---|---|
| `sutures-langgraph` | LangGraph | ✅ Alpha | `pip install sutures-langgraph` |
| `@sutures/core` | Generic (any framework) | ✅ Alpha | `npm install @sutures/core` |
| `@sutures/adapter-crewai` | CrewAI | 🔜 Next | — |
| `@sutures/adapter-openai` | OpenAI Agents SDK | 🔜 Planned | — |
| `@sutures/adapter-autogen` | AutoGen/AG2 | 🔜 Planned | — |

### Building Your Own Adapter

Every adapter implements a simple interface:

```typescript
interface SuturesAdapter {
  init(config: SuturesConfig): Promise<void>;
  instrument(): void;
  checkpoint(agentId: string): Promise<CheckpointData>;
  restore(checkpointId: string): Promise<void>;
  inject(agentId: string, injection: BreakpointInjectData): Promise<void>;
  resume(agentId: string): Promise<void>;
  shutdown(): Promise<void>;
}
```

## Project Structure

```
sutures/
├── AGENT_EVENT_PROTOCOL.md     # Open protocol specification
├── packages/
│   ├── core/                   # @sutures/core (TypeScript)
│   │   ├── types.ts            # All type definitions
│   │   ├── client.ts           # WebSocket client + event emitter
│   │   ├── otel-mapper.ts      # OTEL span mapper
│   │   └── index.ts            # Barrel exports
│   ├── adapter-langgraph/      # Python adapter for LangGraph
│   │   └── sutures_langgraph.py
│   ├── adapter-generic/        # Generic adapter (coming)
│   └── collector/              # WebSocket collector server (coming)
└── apps/
    └── dashboard/              # React Flow visual debugger (coming)
```

## Roadmap

- [x] AgentEvent Protocol v1.0 specification
- [x] Core TypeScript types + WebSocket client
- [x] OTEL span mapper (GenAI semantic conventions)
- [x] LangGraph Python adapter with breakpoint engine
- [ ] WebSocket collector server
- [ ] React Flow live topology canvas
- [ ] Execution timeline with fork/replay
- [ ] Breakpoint intervention console
- [ ] CrewAI adapter
- [ ] OpenAI Agents SDK adapter
- [ ] `npx sutures` zero-config launcher
- [ ] Shareable HTML trace export
- [ ] Docker one-liner deployment

## Related Projects

- **[Scalpel](https://github.com/anupmaster/scalpel)** — Surgical AI for your codebase (by the same author)
- **[AgentPrism](https://github.com/evilmartians/agent-prism)** — React components for trace visualization (complementary)
- **[AGDebugger](https://arxiv.org/abs/2503.02068)** — Academic research on interactive multi-agent debugging (CHI 2025)
- **[DoVer](https://arxiv.org/abs/2512.06749)** — Intervention-driven auto debugging for multi-agent systems

## Contributing

We welcome contributions! See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

Key areas where help is needed:
- 🎨 **Dashboard UI** — React Flow canvas, timeline, breakpoint console
- 🔌 **Adapters** — CrewAI, OpenAI Agents SDK, AutoGen, Google ADK
- 📖 **Documentation** — Tutorials, integration guides
- 🧪 **Testing** — Protocol conformance tests, adapter tests

## License

Apache 2.0 — see [LICENSE](./LICENSE)

---

<p align="center">
  <sub>Created by <a href="https://github.com/anupmaster"><strong>Anup Karanjkar</strong></a> &middot; <a href="https://anupkaranjkar.com">anupkaranjkar.com</a></sub>
</p>
