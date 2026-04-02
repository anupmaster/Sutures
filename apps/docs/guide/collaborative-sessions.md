# Collaborative Sessions

Sutures supports multi-user collaborative debugging sessions, letting multiple developers inspect and debug the same agent swarm simultaneously — like Google Docs for agent debugging.

## How It Works

When a dashboard client connects, it can join a collaborative session. Each user gets:

- A **unique session ID** and **assigned color**
- **Live cursor sharing** — see where other users are looking on the topology canvas
- **Selection broadcasting** — see which agent other users have selected
- **Shared breakpoint control** — any user can set/release breakpoints

## Joining a Session

Send a session message over WebSocket when connecting to the dashboard:

```json
{
  "type": "session",
  "payload": {
    "action": "join",
    "user_name": "Alice"
  }
}
```

The server responds with a session confirmation including your assigned color and a list of all active sessions:

```json
{
  "type": "session",
  "payload": {
    "action": "join",
    "session_id": "a1b2c3d4",
    "user_name": "Alice",
    "color": "#10B981",
    "active_sessions": [
      { "session_id": "a1b2c3d4", "user_name": "Alice", "color": "#10B981" },
      { "session_id": "e5f6g7h8", "user_name": "Bob", "color": "#3B82F6" }
    ]
  }
}
```

## Cursor Sharing

Broadcast your cursor position to other users:

```json
{
  "type": "session",
  "payload": {
    "action": "cursor",
    "cursor": {
      "node_id": "researcher",
      "panel": "inspector",
      "x": 250,
      "y": 180
    }
  }
}
```

Other dashboard clients receive this cursor data and render a colored cursor indicator with the user's name.

## Selection Broadcasting

When a user selects an agent in the topology, it is broadcast to all other users:

```json
{
  "type": "session",
  "payload": {
    "action": "selection",
    "selected_agent_id": "writer"
  }
}
```

Other users see a colored highlight ring on the selected agent node.

## Session Colors

Users are assigned colors from a rotating palette:

| Index | Color |
|---|---|
| 0 | `#10B981` (Emerald) |
| 1 | `#3B82F6` (Blue) |
| 2 | `#F59E0B` (Amber) |
| 3 | `#EF4444` (Red) |
| 4 | `#8B5CF6` (Purple) |
| 5 | `#EC4899` (Pink) |
| 6 | `#14B8A6` (Teal) |
| 7 | `#F97316` (Orange) |

## Leaving a Session

Sessions are automatically cleaned up when the WebSocket disconnects. You can also explicitly leave:

```json
{
  "type": "session",
  "payload": {
    "action": "leave"
  }
}
```

Other users receive a `leave` notification and the cursor/selection indicators are removed.

## Use Cases

- **Pair debugging** — Two developers inspect a failing swarm together, one watching the topology while the other examines memory
- **Incident response** — Team swarms around a production issue, with each person investigating a different agent
- **Code review** — Demonstrate agent behavior to reviewers by pointing at specific agents and breakpoints in real-time
- **Teaching** — Walk through agent execution with a class, highlighting concepts as they happen
