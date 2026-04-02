# Setup with Cursor

This guide walks you through configuring Sutures as an MCP server in Cursor, enabling AI-assisted debugging of your agent swarms directly from your editor.

## Prerequisites

- Cursor installed (with MCP support)
- Sutures installed and built (`pnpm install && pnpm build`)

## Configuration

Add Sutures to your Cursor MCP settings. Open Cursor Settings and navigate to the MCP section, or edit your project's `.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "sutures": {
      "command": "npx",
      "args": ["sutures", "mcp"]
    }
  }
}
```

Or if running from a local checkout:

```json
{
  "mcpServers": {
    "sutures": {
      "command": "node",
      "args": ["./path/to/sutures/bin/sutures.js", "mcp"]
    }
  }
}
```

## Verify Connection

After configuring, restart Cursor or reload the MCP servers. The Sutures tools should appear in your available tool list. Test by asking:

> "List agents using Sutures"

## Usage

The 18 MCP tools work the same way as in Claude Code. Cursor's agent can:

- Query agent status and topology
- Inspect context windows and memory hierarchies
- Set and manage breakpoints
- Inject state and resume paused agents
- Fork and replay from checkpoints
- Analyze costs and root causes

## Workflow Example

1. Start your agent swarm with the Sutures adapter attached
2. Open the Sutures dashboard in a browser (`http://localhost:9472`) for visual monitoring
3. Use Cursor's AI chat to interact with the swarm via MCP tools
4. Set breakpoints, inspect state, and inject fixes — all from the chat

## Tips

- Use the Sutures dashboard alongside Cursor for the best experience — visual topology in the browser, tool interactions in the editor
- Ask Cursor to "monitor" by periodically calling `get_swarm_summary`
- When debugging, ask Cursor to compare the `get_context_window` output with your agent's expected behavior
