"""End-to-end over a real Socket.IO connection."""

import asyncio
import socket

import pytest
import socketio
import uvicorn

from wingman.app import create_app

from .fakes import FakeProvider, FakeScreen


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


@pytest.fixture
async def server(settings):
    app = create_app(settings, screen=FakeScreen(), provider_overrides={"groq": FakeProvider("groq", ["Four", "."])})
    port = free_port()
    server = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning"))
    task = asyncio.create_task(server.serve())
    while not server.started:
        await asyncio.sleep(0.02)
    yield f"http://127.0.0.1:{port}", app.other_asgi_app.state.tokens.app_token
    server.should_exit = True
    await task


async def test_rejects_connection_without_token(server):
    url, _ = server
    sio = socketio.AsyncClient()
    with pytest.raises(socketio.exceptions.ConnectionError):
        await sio.connect(url, auth={"token": "wrong"}, transports=["websocket"])


async def test_ask_streams_answer(server):
    url, token = server
    sio = socketio.AsyncClient()
    status, done = asyncio.Future(), asyncio.Future()
    sio.on("status", lambda data: status.done() or status.set_result(data))
    sio.on("answer_done", lambda data: done.set_result(data))
    await sio.connect(url, auth={"token": token}, transports=["websocket"])
    assert (await asyncio.wait_for(status, 2))["provider"] == "groq"
    ack = await sio.call("ask", {"question": "2 + 2?"}, timeout=2)
    assert ack["ok"]
    result = await asyncio.wait_for(done, 2)
    assert result["answer"] == "Four." and result["answer_id"] == ack["answer_id"]
    bad = await sio.call("update_settings", {"temprature": 2}, timeout=2)
    assert not bad["ok"] and "temprature" in bad["error"]
    screen = await sio.call("capture_screen", {}, timeout=2)
    assert screen["ok"]
    await sio.disconnect()
