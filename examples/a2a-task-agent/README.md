# A2A Task Agent — Sutures Example

A demo Google A2A (Agent-to-Agent) protocol agent traced with Sutures.

Shows a multi-agent coordinator/researcher topology in the Sutures dashboard using the A2A adapter.

## Setup

```bash
# Start the Sutures collector + dashboard
npx sutures

# Install dependencies
pip install sutures-a2a aiohttp

# Run the example
python main.py
```

Open http://localhost:9472 to see the live agent topology.

## What it does

1. Simulates a **coordinator** agent receiving a research task
2. Coordinator delegates to a **researcher** via A2A push notification (visible as a handoff in Sutures)
3. Researcher streams thinking updates, produces an artifact, and completes
4. Coordinator receives the result and completes
5. Starts an A2A JSON-RPC server on port 8080 that you can send tasks to

## Send a task to the running server

```bash
curl -X POST http://localhost:8080/a2a \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tasks/send",
    "params": {
      "id": "test-task-1",
      "message": {
        "role": "user",
        "parts": [{"type": "text", "text": "Explain transformer architecture"}]
      }
    }
  }'
```

## Event Mapping

| A2A Concept | Sutures Event |
|---|---|
| Task created | agent.spawned |
| Task working | turn.started |
| Task completed | agent.completed |
| Task failed | agent.failed |
| Task canceled | agent.paused |
| Message (user->agent) | turn.started |
| Message (agent->user) | turn.completed |
| Artifact produced | turn.observed |
| Push notification | handoff.initiated |
| Streaming update | turn.thinking |
