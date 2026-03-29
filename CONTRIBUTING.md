# Contributing to Sutures

Thank you for your interest in contributing to Sutures! This project is building the debugger that every multi-agent developer needs.

## High-Impact Areas

We're actively seeking help in these areas:

### 🎨 Dashboard UI (Highest Priority)
- React Flow live topology canvas
- Execution timeline with scrubber
- Breakpoint intervention console
- Agent inspector panel
- Cost dashboard

### 🔌 Framework Adapters
- CrewAI adapter (Python)
- OpenAI Agents SDK adapter (Python/TypeScript)
- AutoGen/AG2 adapter (Python)
- Google ADK adapter (Python)

### 🧪 Testing
- Protocol conformance test suite
- Adapter integration tests
- WebSocket collector tests

### 📖 Documentation
- Integration tutorials
- Video walkthroughs
- Framework-specific guides

## Development Setup

### Prerequisites
- Node.js 20+
- pnpm 9+
- Python 3.10+ (for Python adapters)

### Getting Started

```bash
git clone https://github.com/anupmaster/sutures.git
cd sutures
pnpm install
pnpm build
```

For Python adapters:
```bash
cd packages/adapter-langgraph
pip install -e ".[dev]"
```

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/your-feature`)
3. Make your changes
4. Run linting and tests
5. Commit with conventional commits (`feat:`, `fix:`, `docs:`, `chore:`)
6. Push and open a PR

## Code Style

- **TypeScript**: Follow existing patterns. Use strict types, no `any` unless absolutely necessary.
- **Python**: Follow PEP 8. Use type hints. Run `ruff` for linting.
- **Commits**: Use [Conventional Commits](https://www.conventionalcommits.org/).

## Protocol Changes

Changes to the AgentEvent Protocol (`AGENT_EVENT_PROTOCOL.md`) require:
1. An RFC-style issue describing the change
2. Discussion period (minimum 3 days)
3. Update to protocol version number
4. Update to all affected adapters

## Questions?

Open an issue or start a discussion. We're friendly.

---

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
