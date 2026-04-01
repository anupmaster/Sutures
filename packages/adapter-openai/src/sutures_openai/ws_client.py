"""WebSocket client for sending events to the Sutures collector."""
from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import websockets
from websockets.asyncio.client import ClientConnection

from sutures_openai.events import AgentEvent

logger = logging.getLogger("sutures.openai")


class SuturesWSClient:
    def __init__(self, url: str = "ws://localhost:9470/v1/events"):
        self.url = url
        self._ws: ClientConnection | None = None
        self._buffer: list[AgentEvent] = []
        self._connected = False

    async def connect(self) -> None:
        try:
            self._ws = await websockets.connect(self.url)
            self._connected = True
            logger.info("Connected to Sutures collector at %s", self.url)
            for event in self._buffer:
                await self._send(event)
            self._buffer.clear()
        except Exception as e:
            logger.warning("Failed to connect to Sutures collector: %s", e)
            self._connected = False

    async def send_event(self, event: AgentEvent) -> None:
        if self._connected and self._ws:
            await self._send(event)
        else:
            self._buffer.append(event)
            if len(self._buffer) > 1000:
                self._buffer = self._buffer[-500:]

    async def _send(self, event: AgentEvent) -> None:
        if not self._ws:
            return
        try:
            msg = json.dumps({"type": "event", "payload": event.to_dict()})
            await self._ws.send(msg)
        except Exception as e:
            logger.warning("Failed to send event: %s", e)
            self._connected = False

    async def close(self) -> None:
        if self._ws:
            await self._ws.close()
            self._connected = False

    def send_event_sync(self, event: AgentEvent) -> None:
        try:
            loop = asyncio.get_running_loop()
            loop.create_task(self.send_event(event))
        except RuntimeError:
            asyncio.run(self.send_event(event))
