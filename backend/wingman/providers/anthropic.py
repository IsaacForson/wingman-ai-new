from __future__ import annotations

import json
from collections.abc import AsyncIterator

import httpx

from .base import GenParams, Message, Provider, ProviderError, StreamStats, describe_http_error

API_VERSION = "2023-06-01"


class AnthropicProvider(Provider):
    def _headers(self) -> dict[str, str]:
        return {
            "x-api-key": self.api_key or "",
            "anthropic-version": API_VERSION,
            "content-type": "application/json",
        }

    @staticmethod
    def _split_system(messages: list[Message]) -> tuple[str, list[dict[str, str]]]:
        system = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
        rest: list[dict[str, str]] = []
        for m in messages:
            if m["role"] == "system":
                continue
            # The Messages API requires alternating roles; merge consecutive turns.
            if rest and rest[-1]["role"] == m["role"]:
                rest[-1] = {"role": m["role"], "content": rest[-1]["content"] + "\n\n" + m["content"]}
            else:
                rest.append({"role": m["role"], "content": m["content"]})
        if rest and rest[0]["role"] != "user":
            rest.insert(0, {"role": "user", "content": "(conversation continues)"})
        return system, rest

    async def stream(self, messages: list[Message], params: GenParams, stats: StreamStats) -> AsyncIterator[str]:
        system, convo = self._split_system(messages)
        payload = {
            "model": params.model,
            "max_tokens": params.max_tokens,
            "temperature": params.temperature,
            "messages": convo,
            "stream": True,
        }
        if system:
            payload["system"] = system
        try:
            async with self.client.stream(
                "POST", f"{self.base_url}/messages", headers=self._headers(), json=payload
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
                    try:
                        event = json.loads(line[5:].strip())
                    except json.JSONDecodeError:
                        continue
                    kind = event.get("type")
                    if kind == "content_block_delta":
                        delta = event.get("delta") or {}
                        if delta.get("type") == "text_delta" and delta.get("text"):
                            yield delta["text"]
                    elif kind == "message_start":
                        usage = (event.get("message") or {}).get("usage") or {}
                        stats.input_tokens = usage.get("input_tokens")
                    elif kind == "message_delta":
                        usage = event.get("usage") or {}
                        stats.output_tokens = usage.get("output_tokens", stats.output_tokens)
                    elif kind == "error":
                        msg = (event.get("error") or {}).get("message", "unknown error")
                        raise ProviderError(self.spec.id, f"{self.spec.label}: {msg}")
        except httpx.TimeoutException as e:
            raise ProviderError(self.spec.id, f"{self.spec.label} timed out.") from e
        except httpx.HTTPError as e:
            raise ProviderError(self.spec.id, f"Couldn't reach {self.spec.label}: {e}") from e

    async def list_models(self) -> list[str]:
        resp = await self.client.get(
            f"{self.base_url}/models", headers=self._headers(), params={"limit": 100}, timeout=10
        )
        resp.raise_for_status()
        return sorted({m["id"] for m in resp.json().get("data", []) if m.get("id")})
