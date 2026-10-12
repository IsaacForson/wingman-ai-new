"""Settings the user changes while the app runs, plus API keys held in memory."""

from __future__ import annotations

import json
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .config import Settings
from .db import Database
from .events import Mode

Transcription = Literal["auto", "groq", "openai", "local", "off"]
WhisperSize = Literal["tiny", "base", "small", "medium", "large-v3"]


class RuntimeConfig(BaseModel):
    model_config = ConfigDict(validate_assignment=True, json_schema_serialization_defaults_required=True)

    mode: Mode = "interview"
    provider: str = "groq"
    model: str | None = None  # None -> the provider's default model
    fallback: bool = True  # try other configured providers if the first fails before streaming
    temperature: float = Field(0.4, ge=0.0, le=1.5)
    max_tokens: int = Field(1024, ge=64, le=16384)

    transcription: Transcription = "auto"
    local_whisper_model: WhisperSize = "base"
    language: str = "en"
    vad_aggressiveness: int = Field(2, ge=0, le=3)
    endpoint_silence_ms: int = Field(700, ge=200, le=3000)
    live_partials: bool = True
    auto_answer: bool = True  # answer questions detected in the other speaker's audio

    ollama_base_url: str = "http://localhost:11434"


class RuntimeUpdate(BaseModel):
    """Partial update; unknown fields are rejected instead of silently ignored."""

    model_config = ConfigDict(extra="forbid")

    mode: Mode | None = None
    provider: str | None = None
    model: str | None = None
    fallback: bool | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    transcription: Transcription | None = None
    local_whisper_model: WhisperSize | None = None
    language: str | None = None
    vad_aggressiveness: int | None = None
    endpoint_silence_ms: int | None = None
    live_partials: bool | None = None
    auto_answer: bool | None = None
    ollama_base_url: str | None = None


class RuntimeStore:
    KEY = "runtime_config"

    def __init__(self, db: Database, settings: Settings):
        self._db = db
        self.config = RuntimeConfig(
            provider=settings.ai_provider,
            model=settings.ai_model,
            temperature=settings.temperature,
            max_tokens=settings.max_tokens,
            transcription=settings.transcription_provider,  # type: ignore[arg-type]
            local_whisper_model=settings.local_whisper_model,  # type: ignore[arg-type]
            ollama_base_url=settings.ollama_base_url,
        )

    async def load(self) -> None:
        row = await self._db.fetchone("SELECT value FROM kv WHERE key = ?", (self.KEY,))
        if row:
            try:
                saved = json.loads(row["value"])
                self.config = RuntimeConfig.model_validate({**self.config.model_dump(), **saved})
            except (ValueError, TypeError):
                pass  # corrupt or outdated settings: keep defaults

    async def update(self, update: RuntimeUpdate) -> RuntimeConfig:
        changes = update.model_dump(exclude_unset=True)
        if "provider" in changes and "model" not in changes:
            changes["model"] = None  # switching provider resets to its default model
        self.config = RuntimeConfig.model_validate({**self.config.model_dump(), **changes})
        await self._db.execute(
            "INSERT INTO kv(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (self.KEY, self.config.model_dump_json()),
        )
        return self.config


class SecretStore:
    """API keys live only in memory. The desktop app keeps them encrypted at
    rest with the OS keychain (Electron safeStorage) and pushes them here."""

    def __init__(self, initial: dict[str, str] | None = None):
        self._keys: dict[str, str] = dict(initial or {})

    def get(self, provider: str) -> str | None:
        return self._keys.get(provider)

    def set(self, provider: str, key: str | None) -> None:
        if key:
            self._keys[provider] = key.strip()
        else:
            self._keys.pop(provider, None)

    def configured(self) -> set[str]:
        return set(self._keys)
