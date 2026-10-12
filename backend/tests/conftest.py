from __future__ import annotations

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient

from wingman.app import create_app
from wingman.config import Settings
from wingman.db import Database
from wingman.events import RecordingNotifier
from wingman.providers.router import ProviderRouter
from wingman.providers.usage import UsageTracker
from wingman.runtime import RuntimeStore, SecretStore

from .fakes import FakeProvider, FakeScreen


@pytest.fixture
def settings(tmp_path):
    return Settings(data_dir=tmp_path, _env_file=None)


@pytest.fixture
def db():
    database = Database(":memory:")
    yield database
    database.close()


@pytest.fixture
def notifier():
    return RecordingNotifier()


@pytest_asyncio.fixture
async def make_router(db, settings):
    def factory(overrides: dict[str, FakeProvider], fallback: bool = True, keys: dict | None = None):
        runtime = RuntimeStore(db, settings)
        runtime.config.provider = next(iter(overrides)) if overrides else "groq"
        runtime.config.fallback = fallback
        return ProviderRouter(None, SecretStore(keys), runtime, UsageTracker(db), overrides=overrides)  # type: ignore[arg-type]

    return factory


@pytest.fixture
def fake_provider():
    return FakeProvider("groq", ["The answer", " is 42."])


@pytest.fixture
def client(settings, fake_provider):
    app = create_app(settings, screen=FakeScreen(), provider_overrides={"groq": fake_provider})
    with TestClient(app) as c:
        c.tokens = app.other_asgi_app.state.tokens  # type: ignore[attr-defined]
        c.engine = app.other_asgi_app.state.engine  # type: ignore[attr-defined]
        c.headers["Authorization"] = f"Bearer {c.tokens.app_token}"
        yield c
