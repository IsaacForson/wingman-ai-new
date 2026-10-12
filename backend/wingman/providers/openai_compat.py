from __future__ import annotations

import json
from collections.abc import AsyncIterator
from typing import Any

import httpx

from .base import GenParams, Message, Provider, ProviderError, StreamStats, describe_http_error


class OpenAICompatProvider(Provider):
    """Any API that speaks OpenAI's /chat/completions streaming format."""

    def _headers(self) -> dict[str, str]:
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["Authorization"] = f"Bearer {self.api_key}"
        if self.spec.id == "openrouter":
            headers["X-Title"] = "Wingman AI"
        return headers

    def _payload(self, messages: list[Message], params: GenParams) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": params.model,
            "messages": messages,
            "stream": True,
        }
        if self.spec.id == "openai":
            # Current OpenAI models take max_completion_tokens and only the default temperature.
            payload["max_completion_tokens"] = params.max_tokens
        else:
            payload["max_tokens"] = params.max_tokens
            payload["temperature"] = params.temperature
        if self.spec.stream_usage:
            payload["stream_options"] = {"include_usage": True}
        if "gpt-oss" in params.model and self.spec.id in ("groq", "together"):
            # Reasoning models: keep the hidden reasoning short so the answer starts fast.
            payload["reasoning_effort"] = "low"
        return payload

    async def stream(self, messages: list[Message], params: GenParams, stats: StreamStats) -> AsyncIterator[str]:
        url = f"{self.base_url}/chat/completions"
        try:
            async with self.client.stream(
                "POST", url, headers=self._headers(), json=self._payload(messages, params)
            ) as resp:
                if resp.status_code != 200:
                    body = (await resp.aread()).decode("utf-8", "replace")
                    raise ProviderError(
                        self.spec.id,
                        describe_http_error(self.spec.label, resp.status_code, body, params.model),
                        resp.status_code,
                    )
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    try:
                        event = json.loads(data)
                    except json.JSONDecodeError:
                        continue
                    if err := event.get("error"):
                        msg = err.get("message") if isinstance(err, dict) else str(err)
                        raise ProviderError(self.spec.id, f"{self.spec.label}: {msg}")
                    if usage := event.get("usage"):
                        stats.input_tokens = usage.get("prompt_tokens", stats.input_tokens)
                        stats.output_tokens = usage.get("completion_tokens", stats.output_tokens)
                    for choice in event.get("choices") or []:
                        text = (choice.get("delta") or {}).get("content")
                        if text:
                            yield text
        except httpx.TimeoutException as e:
            raise ProviderError(self.spec.id, f"{self.spec.label} timed out.") from e
        except httpx.ConnectError as e:
            hint = " Is Ollama running?" if self.spec.local else ""
            raise ProviderError(self.spec.id, f"Couldn't reach {self.spec.label}.{hint}") from e
        except httpx.HTTPError as e:
            raise ProviderError(self.spec.id, f"{self.spec.label} connection error: {e}") from e

    async def list_models(self) -> list[str]:
        resp = await self.client.get(f"{self.base_url}/models", headers=self._headers(), timeout=10)
        resp.raise_for_status()
        data = resp.json()
        items = data.get("data") if isinstance(data, dict) else data
        ids = []
        for item in items or []:
            model_id = item.get("id") if isinstance(item, dict) else None
            if model_id:
                ids.append(model_id.removeprefix("models/"))
        return sorted(set(ids))
