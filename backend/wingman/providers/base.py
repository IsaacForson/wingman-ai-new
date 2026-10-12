from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import TypedDict

import httpx

from .catalog import ProviderSpec


class Message(TypedDict):
    role: str  # system | user | assistant
    content: str


@dataclass
class GenParams:
    model: str
    temperature: float
    max_tokens: int


@dataclass
class StreamStats:
    input_tokens: int | None = None
    output_tokens: int | None = None


class ProviderError(Exception):
    """A provider call failed. ``message`` is safe to show to the user."""

    def __init__(self, provider: str, message: str, status: int | None = None):
        super().__init__(f"{provider}: {message}")
        self.provider = provider
        self.message = message
        self.status = status


def describe_http_error(label: str, status: int, body: str, model: str) -> str:
    if status in (401, 403):
        return f"{label} rejected the API key. Check it in Settings → AI."
    if status == 404 or "model_not_found" in body or "does not exist" in body:
        return f"{label} doesn't offer the model '{model}'. Pick another in Settings → AI."
    if status == 429:
        return f"{label} rate limit reached. Wait a moment or switch provider."
    if status >= 500:
        return f"{label} is having problems (HTTP {status}). Try again or switch provider."
    snippet = body.strip().replace("\n", " ")[:200]
    return f"{label} returned HTTP {status}: {snippet}"


class Provider(ABC):
    def __init__(self, spec: ProviderSpec, client: httpx.AsyncClient, api_key: str | None, base_url: str | None = None):
        self.spec = spec
        self.client = client
        self.api_key = api_key
        self.base_url = (base_url or spec.base_url).rstrip("/")

    @abstractmethod
    def stream(self, messages: list[Message], params: GenParams, stats: StreamStats) -> AsyncIterator[str]:
        """Yield text deltas. Raise ProviderError on failure."""

    @abstractmethod
    async def list_models(self) -> list[str]: ...
