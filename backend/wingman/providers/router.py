"""Chooses a provider, streams from it, falls back safely and records usage.

Fallback only happens before the first token arrives. Once text has been shown
to the user, switching provider would glue two unrelated answers together, so
a mid-stream failure is reported as an error instead.
"""

from __future__ import annotations

import asyncio
import time
from collections.abc import AsyncIterator

import httpx
from loguru import logger

from ..runtime import RuntimeStore, SecretStore
from .anthropic import AnthropicProvider
from .base import GenParams, Message, Provider, ProviderError, StreamStats
from .catalog import FALLBACK_ORDER, PROVIDERS, ProviderSpec
from .openai_compat import OpenAICompatProvider
from .usage import UsageTracker

MODEL_CACHE_TTL = 600


class NoProviderConfigured(ProviderError):
    def __init__(self) -> None:
        super().__init__("none", "No AI provider is set up. Add an API key in Settings → AI, or run Ollama locally.")


class StreamHandle:
    """Async-iterable stream of text that remembers which provider answered."""

    def __init__(
        self,
        router: ProviderRouter,
        messages: list[Message],
        candidates: list[tuple[str, str]],
        temperature: float,
        max_tokens: int,
        purpose: str,
    ):
        self._router = router
        self._messages = messages
        self._candidates = candidates
        self._temperature = temperature
        self._max_tokens = max_tokens
        self._purpose = purpose
        self.provider: str | None = None
        self.model: str | None = None
        self.ttft_ms: float | None = None
        self.total_ms: float = 0.0
        self.fell_back_from: str | None = None
        self.text = ""

    def __aiter__(self) -> AsyncIterator[str]:
        return self._run()

    async def _run(self) -> AsyncIterator[str]:
        errors: list[ProviderError] = []
        started = time.perf_counter()
        for pid, model in self._candidates:
            provider = self._router.provider(pid)
            stats = StreamStats()
            t0 = time.perf_counter()
            got_first = False
            try:
                params = GenParams(model=model, temperature=self._temperature, max_tokens=self._max_tokens)
                async for chunk in provider.stream(self._messages, params, stats):
                    if not got_first:
                        got_first = True
                        self.provider, self.model = pid, model
                        self.ttft_ms = round((time.perf_counter() - t0) * 1000, 1)
                        if errors:
                            self.fell_back_from = errors[0].provider
                    self.text += chunk
                    yield chunk
            except asyncio.CancelledError:
                await self._record(pid, model, False, t0, stats, "cancelled")
                raise
            except ProviderError as e:
                await self._record(pid, model, False, t0, stats, e.message)
                if got_first:
                    raise  # never fall back mid-answer
                logger.warning("Provider {} failed before streaming: {}", pid, e.message)
                errors.append(e)
                continue
            except Exception as e:  # unexpected bug inside a provider
                await self._record(pid, model, False, t0, stats, repr(e))
                if got_first:
                    raise ProviderError(pid, f"{PROVIDERS[pid].label} stream broke: {e}") from e
                errors.append(ProviderError(pid, f"{PROVIDERS[pid].label} failed: {e}"))
                continue
            else:
                if not got_first:
                    # Empty answer counts as success but we still note the provider.
                    self.provider, self.model = pid, model
                await self._record(pid, model, True, t0, stats, None)
                self.total_ms = round((time.perf_counter() - started) * 1000, 1)
                return
        self.total_ms = round((time.perf_counter() - started) * 1000, 1)
        if not errors:
            raise NoProviderConfigured()
        raise (
            errors[0] if len(errors) == 1 else ProviderError(errors[0].provider, " / ".join(e.message for e in errors))
        )

    async def _record(self, pid, model, ok, t0, stats: StreamStats, error):
        try:
            await self._router.usage.record(
                provider=pid,
                model=model,
                purpose=self._purpose,
                ok=ok,
                ttft_ms=self.ttft_ms if ok or self.provider == pid else None,
                total_ms=round((time.perf_counter() - t0) * 1000, 1),
                input_tokens=stats.input_tokens,
                output_tokens=stats.output_tokens,
                error=error,
            )
        except Exception as e:  # usage tracking must never break answering
            logger.debug("usage record failed: {}", e)


class ProviderRouter:
    def __init__(
        self,
        client: httpx.AsyncClient,
        secrets: SecretStore,
        runtime: RuntimeStore,
        usage: UsageTracker,
        overrides: dict[str, Provider] | None = None,
    ):
        self.client = client
        self.secrets = secrets
        self.runtime = runtime
        self.usage = usage
        self._overrides = overrides or {}
        self._model_cache: dict[str, tuple[float, list[str]]] = {}

    # -- provider selection ---------------------------------------------------
    def spec(self, pid: str) -> ProviderSpec:
        if pid not in PROVIDERS:
            raise ProviderError(pid, f"Unknown provider '{pid}'.")
        return PROVIDERS[pid]

    def is_configured(self, pid: str) -> bool:
        if pid in self._overrides:
            return True
        spec = PROVIDERS.get(pid)
        return bool(spec) and (not spec.needs_key or bool(self.secrets.get(pid)))

    def provider(self, pid: str) -> Provider:
        if pid in self._overrides:
            return self._overrides[pid]
        spec = self.spec(pid)
        base_url = None
        if pid == "ollama":
            base_url = self.runtime.config.ollama_base_url.rstrip("/") + "/v1"
        cls = AnthropicProvider if spec.kind == "anthropic" else OpenAICompatProvider
        return cls(spec, self.client, self.secrets.get(pid), base_url)

    def resolve_model(self, pid: str, model: str | None = None, fast: bool = False) -> str:
        if model:
            return model
        cfg = self.runtime.config
        if pid == cfg.provider and cfg.model and not fast:
            return cfg.model
        spec = self.spec(pid)
        return spec.fast_model if fast else spec.default_model

    def candidates(
        self, provider: str | None = None, model: str | None = None, fast: bool = False, fallback: bool | None = None
    ) -> list[tuple[str, str]]:
        cfg = self.runtime.config
        primary = provider or cfg.provider
        use_fallback = cfg.fallback if fallback is None else fallback
        result: list[tuple[str, str]] = []
        if self.is_configured(primary):
            result.append((primary, self.resolve_model(primary, model, fast)))
        if use_fallback or not result:
            for pid in FALLBACK_ORDER:
                if pid != primary and self.is_configured(pid):
                    result.append((pid, self.resolve_model(pid, None, fast)))
        return result

    def stream(
        self,
        messages: list[Message],
        *,
        purpose: str = "answer",
        provider: str | None = None,
        model: str | None = None,
        fast: bool = False,
        fallback: bool | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> StreamHandle:
        cfg = self.runtime.config
        return StreamHandle(
            self,
            messages,
            self.candidates(provider, model, fast, fallback),
            cfg.temperature if temperature is None else temperature,
            cfg.max_tokens if max_tokens is None else max_tokens,
            purpose,
        )

    async def complete(self, messages: list[Message], **kwargs) -> tuple[str, StreamHandle]:
        handle = self.stream(messages, **kwargs)
        async for _ in handle:
            pass
        return handle.text, handle

    # -- models ---------------------------------------------------------------
    async def list_models(self, pid: str, refresh: bool = False) -> dict:
        spec = self.spec(pid)
        cached = self._model_cache.get(pid)
        if cached and not refresh and time.time() - cached[0] < MODEL_CACHE_TTL:
            return {"models": cached[1], "live": True, "error": None}
        if not self.is_configured(pid):
            return {"models": [spec.default_model], "live": False, "error": "Add an API key to see live models."}
        try:
            models = await self.provider(pid).list_models()
            self._model_cache[pid] = (time.time(), models)
            return {"models": models, "live": True, "error": None}
        except Exception as e:
            return {"models": [spec.default_model, spec.fast_model], "live": False, "error": str(e)[:200]}
