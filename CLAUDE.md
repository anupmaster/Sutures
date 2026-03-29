# SUTURES — UNBREAKABLE BLUEPRINT v2.1
## The Definitive Development & Strategy Document
## March 30, 2026 | Anup Karanjkar
## Intelligence: Claude Architecture + Grok Research + Dual ORACLE Scans + 9 Papers

> **Master CLAUDE.md** — Every subagent reads this before writing code.

---

# IDENTITY

**Name:** Sutures
**Tagline:** Breakpoints for AI Agents
**Extended:** The live intervention + MCP-native operating system for multi-agent swarms. Pause any agent, see exactly what it sees in its context window, inject fixes, fork reality — then let Claude/Cursor debug your swarm through Sutures itself.
**Sub-tagline:** See what your agents see. Fix what they break. Ship what works.
**Brand family:** Scalpel (codebase surgery) → Sutures (agent tracing & intervention)
**License:** Apache 2.0 | **Repo:** github.com/anupmaster/sutures

---

# THE 7 VALIDATED MARKET GAPS

| Gap | Proof | Competitors |
|---|---|---|
| Live breakpoint intervention (pause/inject/resume) | CHI 2025 AGDebugger (Microsoft) | Zero productized tools |
| Framework-agnostic visual topology | LangGraph time-travel is framework-locked | No standalone tool |
| MCP server for agent debugging | Honeycomb/Datadog launched MCP for infra Mar 2026 | None for agents |
| Agent memory/context window visualization | claude-mem 20K+ stars, 3 repos trending Jan 2026 | Zero debug tools |
| Collaborative live debugging | Replay.io proved category | None for agents |
| Trace-level A/B diff | Testing teams need regression detection | Zero tools |
| AI root cause analysis | AgenTracer 8B model beats R1 by 12% | Academic only |

# SYSTEM ARCHITECTURE (v2.1 — MCP-FIRST)

```
USER MULTI-AGENT SYSTEM (LangGraph / CrewAI / OpenAI Agents / Any)
        |  Framework Adapter (3 lines of code)
        v
SUTURES ADAPTERS — AgentEvent Protocol v1.0 (32 event types)
        |  WebSocket (ws://localhost:9470)
        v
SUTURES COLLECTOR SERVER (Fastify + WS + SQLite + OTEL)
   |-- Event Router + Ring Buffer (10K events)
   |-- Checkpoint Store (SQLite — shared with adapter)
   |-- Breakpoint Controller (13 condition types)
   |-- Anomaly Engine (loop/cost/bloat/cycle detection)
   Ports: WS=9470 | HTTP=9471 | UI=9472 | OTEL=4317/4318
        |                              |
        v                              v
SUTURES MCP SERVER              SUTURES DASHBOARD (UI)
18 tools for Claude Code/       Next.js 16 + React Flow + Tailwind v4
Cursor / Codex                  Topology + Inspector + Memory Debugger +
                                Timeline + Breakpoints + Cost + Diagnostics
```

---

# CRITICAL TECHNICAL DECISIONS (Grok-Validated March 30, 2026)

## LangGraph Async Breakpoints — OFFICIAL APIs ONLY
- LangGraph v1.1.3 is async-first with TaskGroup execution
- NEVER use threading.Event or asyncio.Event — causes deadlocks
- USE ONLY: interrupt() + Command(resume=...) + update_state()
- astream_events yields on_interrupt event and PAUSES (stream stays alive)
- WebSocket connection stays alive through breakpoints — no reconnection needed
- Checkpointer: AsyncSqliteSaver sharing same DB file with collector
- update_state runs through reducers (appends for add_messages, merges for custom)
- InjectionEditor needs Append vs Replace toggle based on reducer type

## Memory Shadow Mode (Killer Feature)
- Shadow agents use InMemorySaver (NOT shared SQLite) for zero contention
- Only persist winning shadow path via aupdate_state on promote
- MCP tool: spawn_shadow(thread_id, checkpoint_id)

## React Flow Performance
- WS message batching (50ms collection window before render)
- useMemo + useCallback on all node/edge components
- ELK layout throttled (not on every event)
- Optional lite mode for >20 nodes (disables G-Memory overlay)

---

# TECH STACK

| Layer | Technology | Version |
|---|---|---|
| Dashboard | Next.js (App Router) | 16 |
| Topology | React Flow | 12+ |
| Auto-Layout | ELK.js | Latest |
| State | Zustand | 5+ |
| Styling | Tailwind CSS | v4 |
| UI Primitives | shadcn/ui | Latest |
| Charts | Recharts | 2+ |
| Icons | Lucide React | Latest |
| Collector | Fastify + @fastify/websocket | 5+ |
| Checkpoint DB | better-sqlite3 | Latest |
| Validation | Zod | 3+ |
| MCP Server | @modelcontextprotocol/sdk | Latest |
| OTEL Export | @opentelemetry/exporter-trace-otlp-http | Latest |
| LangGraph Adapter | Python + websockets + langchain-core | 3.10+ |
| Monorepo | pnpm + Turborepo | 9+ |
| Linting | Biome (TS) + Ruff (Python) | Latest |
| Testing | Vitest (TS) + pytest (Python) | Latest |
| CI/CD | GitHub Actions + changesets | - |

---

# PROTOCOL: 32 EVENT TYPES

## Original 26
Lifecycle: agent.spawned .idle .completed .failed .paused .resumed
Reasoning: turn.started .thinking .thought .acting .observed .completed .failed
Collaboration: handoff.initiated .accepted .rejected .completed
Memory: memory.write .read checkpoint.created
Intervention: breakpoint.set .hit .inject .release
Cost: cost.tokens .api_call

## 6 New Memory Events (9-paper research)
memory.tier_migration (MemoryOS), memory.conflict (HiMem), memory.prune (Focus Agent)
memory.reconsolidate (H-MEM), memory.structure_switch (FluxMem), memory.coherence_violation (Multi-Agent Arch)

---

# 13 BREAKPOINT CONDITIONS

| # | Condition | Trigger |
|---|---|---|
| 1 | always | Every turn of target agent |
| 2 | on_turn | Specific turn number |
| 3 | on_tool | Specific tool called |
| 4 | on_handoff | Handoff from/to specific agent |
| 5 | on_cost | Cumulative cost > threshold |
| 6 | on_error | Any error occurs |
| 7 | on_score | Quality score < threshold |
| 8 | on_memory_tier_migration | Memory moves between STM/MTM/LTM |
| 9 | on_conflict_detected | Contradictory facts in memory |
| 10 | on_context_pressure | Context window > X% |
| 11 | on_memory_structure_switch | Agent changes memory org |
| 12 | on_memory_link_created | New memory graph connection |
| 13 | on_cache_coherence_violation | Agent has stale shared memory |

---

# MCP SERVER — 18 TOOLS

Topology (5): list_agents, get_agent_state, get_topology, get_errors, get_swarm_summary
Memory (5): get_context_window, get_memory_hierarchy, get_shared_memory_map, get_memory_traversal_path, simulate_prune
Breakpoints (5): set_breakpoint, release_breakpoint, inject_and_resume, get_checkpoints, fork_from_checkpoint
Analysis (3): get_root_cause, get_cost_breakdown, export_trace

---

# MEMORY DEBUGGER (9-Paper Research)

Three-Tier: STM(green) → MTM(amber) → LTM(purple) with FIFO/heat migration arrows
Context Pressure Bar: green(0-60%) → amber(60-85%) → red(85-100% cliff)
Shared Memory Map: agent-to-key graph with staleness detection
G-Memory Overlay: Insight↔Query↔Interaction graph on topology canvas
Pruning Heatmap: Hot(keep) vs Cold(prune) with breakpoint-before-prune
Structure Selector: FluxMem override (linear/graph/hybrid with confidence %)

---

# DEVELOPMENT PHASES

## P0: Ship or Die (7 days)
Day 1-2: Collector (Fastify + WS + ring buffer + SQLite checkpoints)
Day 3-5: Dashboard (Next.js 16 + React Flow topology + AgentNode + HandoffEdge + ELK auto-layout)
Day 6: Basic breakpoints (pause/resume) + Agent Inspector panel
Day 7: npx launcher + examples/langgraph-research-swarm + GIF recording + GitHub push

## P0.5: MCP + Memory (Week 3)
MCP server (10 core tools), Memory Debugger (pressure bar + shared memory map)
Test with Claude Code end-to-end

## P1: Injection + Root Cause + Timeline (Week 4-5)
Injection Editor (Append vs Replace), AI Root Cause Analysis
Timeline with swim lanes + fork/replay, Anomaly Detection Engine

## P2: Polish + Community (Week 6-8)
Cost Dashboard, CrewAI adapter, 6 memory breakpoints, MCP → 18 tools
Collaborative sessions, Golden Run Comparator, Plugin system, docs site

## P3: Scale (Month 3+)
OpenAI Agents SDK adapter, VS Code extension, Trace-to-test, Sutures Cloud, A2A

---

# SUBAGENT METHODOLOGY

Rule 1: Plan Mode First — always output plan before code
Rule 2: One Subagent Per Package — never cross package boundaries
Rule 3: Validation Loop — pnpm build && pnpm test && run example 3x after every feature
Rule 4: MCP-First — every feature exposes MCP tool immediately
Rule 5: Perf Gate — 60fps with 30 agents, <2s cold start, zero jank

---

# LAUNCH STRATEGY

Narrative Lockdown: README hero FROZEN 30 days. One story: Pause. See memory. Inject. Fork.
Day 0: GitHub push + star | Day 3: Show HN + Product Hunt
Day 7: Medium article | Day 10: Framework doc PRs | Day 30: Swarm of the Month contest

Real developer quotes for README:
"Shared memory is where most multi-agent setups break down." — @AdolfoUsier
"Every AI agent has a memory problem." — @GetAgentIQ
"0/40 canaries survived into shared memory." — @kevinchunye

Positioning: "VS Code Agent Inspector shows you the graph. Sutures lets you pause it, edit its memory, and let Claude fix it live."

---

# UI DESIGN TOKENS

Brand: #10B981 (emerald) | Brand-hover: #059669
States: idle=#6B7280 thinking=#F59E0B acting=#3B82F6 paused=#EF4444 completed=#10B981
Memory: STM=#10B981 MTM=#F59E0B LTM=#8B5CF6 shared=#3B82F6 stale=#EF4444
Pressure: safe=#10B981 high=#F59E0B cliff=#EF4444
Surfaces: bg=#0A0A0B secondary=#111113 elevated=#1A1A1D surface=#222225
Text: primary=#F5F5F5 secondary=#A1A1AA muted=#71717A
Fonts: display=JetBrains Mono, body=Inter | Theme: Dark-first only

---

# COMPETITIVE INTEL (March 30, 2026)

VS Code Agent Inspector: 1.9K stars, Copilot-locked, NO intervention → Not a competitor
Langfuse: 24K stars, post-hoc traces only → No live intervention
LangSmith: Closed-source, LangChain-locked → No framework agnosticism
AgentOps: SaaS, replay only → No pause/inject/resume
AgentPrism: Component library → No standalone product
agent-replay: CLI-only → No visual debugging

---

*Blueprint v2.1 — March 30, 2026 | Claude + Grok merged | Anup Karanjkar*
