import os
import stat

from fastapi.testclient import TestClient


def test_health_is_public(client: TestClient):
    r = client.get("/health", headers={"Authorization": ""})
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_api_requires_token(client: TestClient):
    assert client.get("/api/status", headers={"Authorization": ""}).status_code == 401
    assert client.get("/api/status", headers={"Authorization": "Bearer nope"}).status_code == 401
    assert client.get("/api/status").status_code == 200


def test_extension_token_is_scoped(client: TestClient):
    ext = {"Authorization": f"Bearer {client.tokens.extension_token}"}
    assert client.get("/api/status", headers=ext).status_code == 403
    assert client.get("/api/conversations", headers=ext).status_code == 403
    r = client.post("/api/extension/explain", json={"text": "What is 6 x 7?"}, headers=ext)
    assert r.status_code == 200
    assert r.json()["answer"] == "The answer is 42."
    assert client.get("/api/extension/ping", headers=ext).json()["ok"] is True
    assert client.get("/api/extension/ping", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_token_files_are_private(client: TestClient, settings):
    for name in ("auth_token", "extension_token"):
        mode = stat.S_IMODE(os.stat(settings.data_dir / name).st_mode)
        assert mode == 0o600


def test_rotating_extension_token_invalidates_old_one(client: TestClient):
    old = client.tokens.extension_token
    new = client.get("/api/extension-token", params={"rotate": True}).json()["token"]
    assert new != old
    r = client.post("/api/extension/explain", json={"text": "hi"}, headers={"Authorization": f"Bearer {old}"})
    assert r.status_code == 401


def test_cors_rejects_random_websites(client: TestClient):
    r = client.options(
        "/api/status", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"}
    )
    assert "access-control-allow-origin" not in r.headers
    r = client.options(
        "/api/status", headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "GET"}
    )
    assert r.headers.get("access-control-allow-origin") == "http://localhost:5173"


def test_injected_token_is_used(tmp_path):
    from wingman.config import Settings
    from wingman.security import TokenStore

    settings = Settings(data_dir=tmp_path, auth_token="x" * 40, _env_file=None)
    store = TokenStore(settings.data_dir, settings.auth_token)
    assert store.app_token == "x" * 40
    assert (tmp_path / "auth_token").read_text() == "x" * 40
