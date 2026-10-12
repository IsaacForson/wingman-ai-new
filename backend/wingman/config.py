"""Static configuration loaded from the environment / .env.

Anything the user can change while the app is running lives in
``wingman.runtime.RuntimeConfig`` instead, so this object is never mutated.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

APP_VERSION = "2.0.0"


def default_data_dir() -> Path:
    # ~/.wingman is shared with the Electron app, which reads the auth token from it
    # when it attaches to a backend it didn't start (e.g. scripts/dev.sh).
    return Path.home() / ".wingman"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", case_sensitive=False, extra="ignore", populate_by_name=True
    )

    host: str = "127.0.0.1"
    port: int = 8765
    log_level: str = "INFO"

    data_dir: Path = Field(
        default_factory=default_data_dir,
        validation_alias=AliasChoices("WINGMAN_DATA_DIR", "DATA_DIR"),
    )
    # Normally injected by Electron. If absent, one is generated and written to
    # <data_dir>/auth_token with owner-only permissions.
    auth_token: str | None = Field(default=None, validation_alias=AliasChoices("WINGMAN_AUTH_TOKEN"))

    # Origins allowed by CORS. Every request still needs the bearer token;
    # this only stops arbitrary web pages from reading responses.
    allowed_origins: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "file://",
        "null",
    ]

    # Provider credentials (optional - can also be pushed at runtime by the desktop app)
    groq_api_key: str | None = None
    google_api_key: str | None = None
    mistral_api_key: str | None = None
    anthropic_api_key: str | None = None
    openai_api_key: str | None = None
    together_api_key: str | None = None
    openrouter_api_key: str | None = None
    ollama_base_url: str = "http://localhost:11434"

    # Initial defaults for the runtime config
    ai_provider: str = "groq"
    ai_model: str | None = None
    temperature: float = 0.4
    max_tokens: int = 1024
    transcription_provider: str = "auto"  # auto | groq | openai | local
    local_whisper_model: str = "base"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "wingman.db"

    def provider_keys(self) -> dict[str, str]:
        keys = {
            "groq": self.groq_api_key,
            "gemini": self.google_api_key,
            "mistral": self.mistral_api_key,
            "anthropic": self.anthropic_api_key,
            "openai": self.openai_api_key,
            "together": self.together_api_key,
            "openrouter": self.openrouter_api_key,
        }
        return {k: v for k, v in keys.items() if v}


@lru_cache
def get_settings() -> Settings:
    return Settings()
