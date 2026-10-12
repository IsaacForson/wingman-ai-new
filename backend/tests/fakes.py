from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from wingman.providers.base import GenParams, Message, Provider, ProviderError, StreamStats
from wingman.providers.catalog import PROVIDERS


class FakeProvider(Provider):
    """Scriptable provider: yields ``chunks``; can fail before or after streaming."""

    def __init__(
        self,
        pid: str = "groq",
        chunks: list[str] | None = None,
        *,
        fail_before: str | None = None,
        fail_after: int | None = None,
        delay: float = 0.0,
        reply: str | None = None,
    ):
        super().__init__(PROVIDERS[pid], client=None, api_key="test")  # type: ignore[arg-type]
        self.chunks = chunks if chunks is not None else ["Hello", " there"]
        if reply is not None:
            self.chunks = [reply]
        self.fail_before = fail_before
        self.fail_after = fail_after
        self.delay = delay
        self.calls: list[tuple[list[Message], GenParams]] = []

    async def stream(self, messages, params, stats: StreamStats) -> AsyncIterator[str]:
        self.calls.append((messages, params))
        if self.fail_before:
            raise ProviderError(self.spec.id, self.fail_before)
        for i, chunk in enumerate(self.chunks):
            if self.fail_after is not None and i == self.fail_after:
                raise ProviderError(self.spec.id, "stream broke")
            if self.delay:
                await asyncio.sleep(self.delay)
            yield chunk
        stats.input_tokens, stats.output_tokens = 10, len(self.chunks)

    async def list_models(self):
        return ["fake-model"]


class FakeScreen:
    available = True

    def __init__(self, text: str = "def add(a, b): return a + b"):
        self.text = text

    async def capture_text(self, monitor: int = 1) -> str:
        return self.text
