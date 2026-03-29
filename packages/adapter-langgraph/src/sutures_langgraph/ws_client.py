"""
Sutures async WebSocket client — connects to the collector, sends events,
receives commands, auto-reconnects with exponential backoff.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections import deque
from typing import Any, Callable, Coroutine

import websockets
from websockets.asyncio.client import ClientConnection

logger = logging.getLogger("sutures.ws")

# Default collector endpoint
DEFAULT_URL = "ws://localhost:9470/v1/events"
DEFAULT_BUFFER_LIMIT = 1000
DEFAULT_MAX_RECONNECT_DELAY = 30.0


CommandHandler = Callable[[dict[str, Any]], Coroutine[Any, Any, None]]


class SuturesWSClient:
    """Async WebSocket client for the Sutures collector.

    Features:
    - Auto-reconnect with exponential backoff (1s, 2s, 4s, ... up to max)
    - Event buffering while disconnected (up to buffer_limit)
    - Receives commands from collector and dispatches to registered handlers
    - Graceful shutdown with flush
    """

    def __init__(
        self,
        url: str = DEFAULT_URL,
        buffer_limit: int = DEFAULT_BUFFER_LIMIT,
        max_reconnect_delay: float = DEFAULT_MAX_RECONNECT_DELAY,
        auto_reconnect: bool = True,
    ) -> None:
        self._url = url
        self._buffer_limit = buffer_limit
        self._max_reconnect_delay = max_reconnect_delay
        self._auto_reconnect = auto_reconnect

        self._ws: ClientConnection | None = None
        self._buffer: deque[dict[str, Any]] = deque(maxlen=buffer_limit)
        self._command_handlers: dict[str, CommandHandler] = {}
        self._connected = False
        self._running = False
        self._recv_task: asyncio.Task[None] | None = None
        self._reconnect_task: asyncio.Task[None] | None = None
        self._connect_lock = asyncio.Lock()

    @property
    def connected(self) -> bool:
        return self._connected

    @property
    def buffered_count(self) -> int:
        return len(self._buffer)

    def on_command(self, command_type: str, handler: CommandHandler) -> None:
        """Register a handler for a specific command type from the collector."""
        self._command_handlers[command_type] = handler

    async def connect(self) -> None:
        """Establish connection to the collector."""
        async with self._connect_lock:
            if self._connected:
                return
            try:
                self._ws = await websockets.connect(
                    self._url,
                    ping_interval=20,
                    ping_timeout=10,
                    close_timeout=5,
                )
                self._connected = True
                self._running = True
                logger.info("Connected to Sutures collector at %s", self._url)

                # Start receiver loop
                self._recv_task = asyncio.create_task(self._receive_loop())

                # Flush buffered events
                await self._flush_buffer()

            except (OSError, websockets.WebSocketException) as exc:
                logger.warning("Failed to connect to collector: %s", exc)
                self._connected = False
                if self._auto_reconnect:
                    self._schedule_reconnect()

    async def disconnect(self) -> None:
        """Gracefully disconnect from the collector."""
        self._running = False
        self._auto_reconnect = False

        if self._reconnect_task and not self._reconnect_task.done():
            self._reconnect_task.cancel()
            try:
                await self._reconnect_task
            except asyncio.CancelledError:
                pass

        if self._recv_task and not self._recv_task.done():
            self._recv_task.cancel()
            try:
                await self._recv_task
            except asyncio.CancelledError:
                pass

        if self._ws:
            try:
                await self._ws.close()
            except Exception:
                pass
            self._ws = None

        self._connected = False
        logger.info("Disconnected from Sutures collector")

    async def send_event(self, event: dict[str, Any]) -> None:
        """Send an event to the collector. Buffers if disconnected."""
        message = {"type": "event", "payload": event}
        if self._connected and self._ws:
            try:
                await self._ws.send(json.dumps(message))
                return
            except (websockets.WebSocketException, OSError) as exc:
                logger.debug("Send failed, buffering: %s", exc)
                self._connected = False
                if self._auto_reconnect:
                    self._schedule_reconnect()

        # Buffer the event
        self._buffer.append(message)
        if len(self._buffer) >= self._buffer_limit:
            logger.warning(
                "Event buffer full (%d). Oldest events will be dropped.",
                self._buffer_limit,
            )

    async def _flush_buffer(self) -> None:
        """Send all buffered events."""
        if not self._ws or not self._connected:
            return
        while self._buffer:
            message = self._buffer.popleft()
            try:
                await self._ws.send(json.dumps(message))
            except (websockets.WebSocketException, OSError):
                # Put it back and bail
                self._buffer.appendleft(message)
                break

    async def _receive_loop(self) -> None:
        """Listen for commands from the collector."""
        if not self._ws:
            return
        try:
            async for raw_message in self._ws:
                if not self._running:
                    break
                try:
                    message = json.loads(raw_message)
                    await self._dispatch_command(message)
                except json.JSONDecodeError:
                    logger.warning("Received non-JSON message from collector")
                except Exception:
                    logger.exception("Error processing collector message")
        except websockets.ConnectionClosed:
            logger.info("Connection to collector closed")
        except asyncio.CancelledError:
            return
        except Exception:
            logger.exception("Unexpected error in receive loop")
        finally:
            self._connected = False
            if self._running and self._auto_reconnect:
                self._schedule_reconnect()

    async def _dispatch_command(self, message: dict[str, Any]) -> None:
        """Route an incoming command to its registered handler."""
        msg_type = message.get("type")
        if msg_type != "command":
            return

        command = message.get("command", "")
        handler = self._command_handlers.get(command)
        if handler:
            await handler(message.get("payload", {}))
        else:
            logger.debug("No handler for command: %s", command)

    def _schedule_reconnect(self) -> None:
        """Schedule a reconnection attempt with exponential backoff."""
        if self._reconnect_task and not self._reconnect_task.done():
            return  # Already scheduled
        self._reconnect_task = asyncio.create_task(self._reconnect_loop())

    async def _reconnect_loop(self) -> None:
        """Reconnect with exponential backoff."""
        delay = 1.0
        while self._running and self._auto_reconnect and not self._connected:
            logger.info("Reconnecting to collector in %.1fs...", delay)
            await asyncio.sleep(delay)
            if not self._running:
                break
            try:
                self._ws = await websockets.connect(
                    self._url,
                    ping_interval=20,
                    ping_timeout=10,
                    close_timeout=5,
                )
                self._connected = True
                logger.info("Reconnected to Sutures collector")
                self._recv_task = asyncio.create_task(self._receive_loop())
                await self._flush_buffer()
                return
            except (OSError, websockets.WebSocketException) as exc:
                logger.debug("Reconnect attempt failed: %s", exc)
                delay = min(delay * 2, self._max_reconnect_delay)
            except asyncio.CancelledError:
                return
