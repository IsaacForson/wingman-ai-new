"""Application factory."""

from __future__ import annotations

import re
import sys
from contextlib import asynccontextmanager

import httpx
import socketio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

from .api.routes import api, extension, public
from .config import APP_VERSION, Settings, get_settings
from .db import Database
from .engine import Engine
from .providers import ProviderRouter
from .providers.usage import UsageTracker
from .runtime import RuntimeStore, SecretStore
from .screen.service import ScreenService
from .security import TokenStore
from .services.conversations import ConversationStore, import_v1
from .services.documents import DocumentStore
from .services.meetings import MeetingService
from .services.practice import PracticeService
from .socket_server import SocketNotifier, make_origin_check, register_handlers

EXTENSION_ORIGIN = re.compile(r"^chrome-extension://[a-p]{32}$")


def setup_logging(settings: Settings) -> None:
    logger.remove()
    logger.add(sys.stderr, level=settings.log_level)
    logs = settings.data_dir / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    logger.add(logs / "backend.log", level=settings.log_level, rotation="10 MB", retention="7 days")


def create_app(
    settings: Settings | None = None, *, screen: ScreenService | None = None, provider_overrides: dict | None = None
) -> socketio.ASGIApp:
    settings = settings or get_settings()
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    tokens = TokenStore(settings.data_dir, settings.auth_token)

    sio = socketio.AsyncServer(
        async_mode="asgi",
        cors_allowed_origins=make_origin_check(settings.allowed_origins),
        max_http_buffer_size=2_000_000,
    )
    state: dict = {}

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        db = Database(settings.db_path)
        client = httpx.AsyncClient(timeout=httpx.Timeout(60.0, connect=10.0))
        runtime = RuntimeStore(db, settings)
        await runtime.load()
        secrets = SecretStore(settings.provider_keys())
        router = ProviderRouter(client, secrets, runtime, UsageTracker(db), overrides=provider_overrides)
        documents = DocumentStore(db)
        conversations = ConversationStore(db)
        if imported := await import_v1(conversations, settings.data_dir / "conversations.json"):
            logger.info("Imported {} conversations from Wingman 1.x", imported)
        engine = Engine(
            runtime=runtime,
            secrets=secrets,
            router=router,
            conversations=conversations,
            documents=documents,
            practice=PracticeService(db, router, documents),
            meetings=MeetingService(db, router),
            screen=screen or ScreenService(),
            notifier=SocketNotifier(sio),
            client=client,
        )
        app.state.engine = engine
        state["engine"] = engine
        logger.info("Wingman backend {} ready on {}:{}", APP_VERSION, settings.host, settings.port)
        yield
        await engine.shutdown()
        await client.aclose()
        db.close()

    app = FastAPI(title="Wingman AI", version=APP_VERSION, lifespan=lifespan)
    app.state.tokens = tokens
    app.state.settings = settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_origin_regex=EXTENSION_ORIGIN.pattern,
        allow_methods=["*"],
        allow_headers=["Authorization", "Content-Type", "X-Wingman-Token"],
    )
    app.include_router(public)
    app.include_router(api)
    app.include_router(extension)
    register_handlers(sio, tokens, lambda: state.get("engine"))
    return socketio.ASGIApp(sio, other_asgi_app=app)
