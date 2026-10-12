"""Local authentication.

The backend listens on 127.0.0.1, which every web page in the user's browser can
also reach. Without a secret, any site could read conversations, burn API
credits or trigger screen captures. Every request therefore needs a bearer token:

* ``app`` scope - the desktop app. Full access. Generated per install/launch.
* ``extension`` scope - the browser extension. Can only use the endpoints it needs.
"""

from __future__ import annotations

import hmac
import os
import secrets
from enum import Enum
from pathlib import Path

from fastapi import Depends, HTTPException, Request, status
from loguru import logger


class Scope(str, Enum):
    APP = "app"
    EXTENSION = "extension"


def _write_private(path: Path, value: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # Create with 0600 from the start so the secret is never world-readable.
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write(value)
    try:
        os.chmod(path, 0o600)
    except OSError:  # pragma: no cover - Windows
        pass


def _read_or_create(path: Path) -> str:
    if path.exists():
        value = path.read_text().strip()
        if len(value) >= 32:
            return value
    value = secrets.token_urlsafe(32)
    _write_private(path, value)
    return value


class TokenStore:
    def __init__(self, data_dir: Path, app_token: str | None = None):
        self._app_path = data_dir / "auth_token"
        self._ext_path = data_dir / "extension_token"
        if app_token:
            if len(app_token) < 32:
                raise ValueError("WINGMAN_AUTH_TOKEN must be at least 32 characters")
            self.app_token = app_token
            _write_private(self._app_path, app_token)
        else:
            self.app_token = _read_or_create(self._app_path)
        self.extension_token = _read_or_create(self._ext_path)
        logger.info("Auth tokens ready (app token file: {})", self._app_path)

    def scope_for(self, token: str | None) -> Scope | None:
        if not token:
            return None
        if hmac.compare_digest(token, self.app_token):
            return Scope.APP
        if hmac.compare_digest(token, self.extension_token):
            return Scope.EXTENSION
        return None

    def rotate_extension_token(self) -> str:
        self.extension_token = secrets.token_urlsafe(32)
        _write_private(self._ext_path, self.extension_token)
        return self.extension_token


def token_from_request(request: Request) -> str | None:
    header = request.headers.get("authorization", "")
    if header.lower().startswith("bearer "):
        return header[7:].strip()
    return request.headers.get("x-wingman-token")


def require(*allowed: Scope):
    """FastAPI dependency factory: ``Depends(require(Scope.APP))``."""

    def dependency(request: Request) -> Scope:
        store: TokenStore = request.app.state.tokens
        scope = store.scope_for(token_from_request(request))
        if scope is None:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing or invalid token")
        if scope not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Token not allowed for this endpoint")
        return scope

    return Depends(dependency)


APP_ONLY = require(Scope.APP)
APP_OR_EXTENSION = require(Scope.APP, Scope.EXTENSION)
