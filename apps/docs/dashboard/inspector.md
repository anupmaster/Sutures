# Agent Inspector

The Agent Inspector is the right sidebar panel that shows detailed information about the currently selected agent. Click any agent node on the topology canvas to open its inspector.

## Sections

### Status Bar

At the top, a status bar shows:
- Agent name and role
- Current status with color indicator
- Model used
- Time since spawn
- Current turn number

### Context Window

The context window section shows exactly what the agent sees:

- **System prompt** — The instructions given to the agent
- **Messages** — The conversation history in the context window
- **Tool results** — Outputs from tool calls included in context
- **Token count** — Total tokens in context with pressure indicator

This mirrors what the MCP `get_context_window` tool returns.

### Turn History

A chronological list of all turns the agent has taken:

- Turn number and timestamp
- Thinking content (if `emit_thinking` is enabled)
- Tool calls with inputs and outputs
- Output summary
- Duration and token counts

### Tool Calls

A focused view of all tool calls the agent has made:

- Tool name
- Input summary
- Output summary
- Duration
- Token cost

### Memory

Quick view of the agent's memory:

- STM entries (green)
- MTM entries (amber)
- LTM entries (purple)
- Shared memory keys (blue) with read/write indicators
- Context pressure bar

### Breakpoints

Manage breakpoints for this agent:

- List active breakpoints with conditions
- Set new breakpoints directly from the inspector
- Release existing breakpoints
- View breakpoint history (hits, releases)

### Cost

Per-agent cost summary:

- Total cost in USD
- Cost by model
- Cost per turn
- Cost trend chart

## Injection Editor

When an agent is paused at a breakpoint, the inspector shows the Injection Editor:

- **Mode toggle**: Append vs Replace
  - **Append** — Add to existing state/messages (default, works with LangGraph's `add_messages` reducer)
  - **Replace** — Overwrite existing state/messages
- **State editor** — JSON editor for modifying agent state
- **Message editor** — Add new messages to inject into the conversation
- **Resume button** — Apply injection and resume the agent

## Collaborative Indicators

When collaborative sessions are active, the inspector shows:

- Colored cursor indicators when another user hovers over the same agent
- Colored ring highlights when another user has selected this agent
- User names and colors in the bottom bar
