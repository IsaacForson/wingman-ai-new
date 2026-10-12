"""Socket.IO transport: authentication, client commands and the event notifier.

Request/response style commands use Socket.IO acknowledgements, so each call
gets its own reply instead of sharing a broadcast event.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

import socketio
from loguru import logger
from pydantic import BaseModel, ValidationError

from .events import event_name
from .providers import ProviderError
from .runtime import RuntimeUpdate
from .screen.service import ScreenUnavailable
from .security import Scope, TokenStore


def make_origin_check(allowed: list[str]) -> Callable[[str | None], bool]:
    def check(origin: str | None) -> bool:
        # Electron's file:// pages and non-browser clients may send no Origin at all;
        # the token check in `connect` is what actually protects the socket.
        return origin is None or origin in allowed or origin.startswith("file://")

    return check


class SocketNotifier:
    def __init__(self, sio: socketio.AsyncServer):
        self.sio = sio

    async def emit(self, payload: BaseModel) -> None:
        await self.sio.emit(event_name(payload), payload.model_dump(mode="json"), room="app")


def ok(**data: Any) -> dict:
    return {"ok": True, **data}


def fail(message: str) -> dict:
    return {"ok": False, "error": message}


def register_handlers(sio: socketio.AsyncServer, tokens: TokenStore, get_engine: Callable[[], Any]) -> None:
    @sio.event
    async def connect(sid, environ, auth):
        token = (auth or {}).get("token") if isinstance(auth, dict) else None
        if tokens.scope_for(token) != Scope.APP:
            logger.warning("Rejected socket connection without a valid token")
            raise socketio.exceptions.ConnectionRefusedError("unauthorized")
        await sio.enter_room(sid, "app")
        engine = get_engine()
        if engine:
            await sio.emit("status", engine.status().model_dump(mode="json"), to=sid)

    @sio.event
    async def disconnect(sid, *args):
        engine = get_engine()
        # If the app window disconnects, stop listening so audio doesn't pile up.
        if engine and not await _has_clients(sio):
            await engine.audio.stop()

    @sio.on("audio")
    async def audio(sid, channel, pcm):
        engine = get_engine()
        if engine and isinstance(pcm, (bytes, bytearray)) and not engine.paused:
            engine.audio.feed(channel, bytes(pcm))

    @sio.on("listen")
    async def listen(sid, data):
        engine = get_engine()
        channels = (data or {}).get("channels") or []
        if channels:
            return ok(channels=await engine.start_listening(channels))
        await engine.stop_listening()
        return ok(channels=[])

    @sio.on("ask")
    async def ask(sid, data):
        data = data or {}
        try:
            result = await get_engine().ask(
                str(data.get("question", "")),
                source=data.get("source") if data.get("source") in ("manual", "regenerate") else "manual",
                conversation_id=data.get("conversation_id"),
                mode=data.get("mode"),
            )
            return ok(**result)
        except ValueError as e:
            return fail(str(e))

    @sio.on("cancel")
    async def cancel(sid, data=None):
        return ok(cancelled=await get_engine().pipeline.cancel((data or {}).get("answer_id")))

    @sio.on("new_conversation")
    async def new_conversation(sid, data=None):
        get_engine().new_conversation()
        return ok()

    @sio.on("open_conversation")
    async def open_conversation(sid, data):
        engine = get_engine()
        conv_id = (data or {}).get("conversation_id")
        if not conv_id or not await engine.conversations.exists(conv_id):
            return fail("That conversation no longer exists.")
        engine.current_conversation_id = conv_id
        return ok()

    @sio.on("update_settings")
    async def update_settings(sid, data):
        try:
            await get_engine().update_config(RuntimeUpdate.model_validate(data or {}))
            return ok(config=get_engine().runtime.config.model_dump())
        except ValidationError as e:
            return fail("; ".join(f"{'.'.join(map(str, err['loc']))}: {err['msg']}" for err in e.errors()))

    @sio.on("pause")
    async def pause(sid, data):
        await get_engine().set_paused(bool((data or {}).get("paused", True)))
        return ok()

    @sio.on("capture_screen")
    async def capture_screen(sid, data=None):
        try:
            return ok(**await get_engine().capture_screen())
        except ScreenUnavailable as e:
            return fail(str(e))

    @sio.on("convert_code")
    async def convert_code(sid, data):
        data = data or {}
        try:
            code = await get_engine().convert_code(data.get("code", ""), data.get("from", ""), data.get("to", ""))
            return ok(code=code)
        except ProviderError as e:
            return fail(e.message)


async def _has_clients(sio: socketio.AsyncServer) -> bool:
    try:
        return bool(list(sio.manager.get_participants("/", "app")))
    except Exception:
        return False
