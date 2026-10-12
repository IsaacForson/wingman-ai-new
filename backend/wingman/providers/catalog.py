"""Every supported provider in one place.

Model lists are fetched live from each provider's /models endpoint (see
``ProviderRouter.list_models``); the defaults here are only starting points
and are checked against the live list before use. Hard-coded model lists are
what left the previous version calling retired models.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


@dataclass(frozen=True)
class ProviderSpec:
    id: str
    label: str
    kind: Literal["openai", "anthropic"]
    base_url: str
    default_model: str
    fast_model: str  # used for cheap background tasks (classification, JSON extraction)
    needs_key: bool = True
    local: bool = False
    free_tier: bool = False
    stream_usage: bool = False  # supports stream_options.include_usage
    key_url: str = ""


PROVIDERS: dict[str, ProviderSpec] = {
    spec.id: spec
    for spec in [
        ProviderSpec(
            id="groq",
            label="Groq",
            kind="openai",
            base_url="https://api.groq.com/openai/v1",
            default_model="openai/gpt-oss-120b",
            fast_model="openai/gpt-oss-20b",
            free_tier=True,
            stream_usage=True,
            key_url="https://console.groq.com/keys",
        ),
        ProviderSpec(
            id="gemini",
            label="Google Gemini",
            kind="openai",
            base_url="https://generativelanguage.googleapis.com/v1beta/openai",
            default_model="gemini-3.5-flash",
            fast_model="gemini-3.5-flash-lite",
            free_tier=True,
            key_url="https://aistudio.google.com/app/apikey",
        ),
        ProviderSpec(
            id="mistral",
            label="Mistral",
            kind="openai",
            base_url="https://api.mistral.ai/v1",
            default_model="mistral-medium-latest",
            fast_model="mistral-small-latest",
            free_tier=True,
            key_url="https://console.mistral.ai/api-keys/",
        ),
        ProviderSpec(
            id="anthropic",
            label="Anthropic Claude",
            kind="anthropic",
            base_url="https://api.anthropic.com/v1",
            default_model="claude-sonnet-5-5",
            fast_model="claude-haiku-5-5",
            key_url="https://console.anthropic.com/settings/keys",
        ),
        ProviderSpec(
            id="openai",
            label="OpenAI",
            kind="openai",
            base_url="https://api.openai.com/v1",
            default_model="gpt-5-mini",
            fast_model="gpt-5-nano",
            stream_usage=True,
            key_url="https://platform.openai.com/api-keys",
        ),
        ProviderSpec(
            id="openrouter",
            label="OpenRouter",
            kind="openai",
            base_url="https://openrouter.ai/api/v1",
            default_model="openrouter/auto",
            fast_model="openrouter/auto",
            stream_usage=True,
            key_url="https://openrouter.ai/settings/keys",
        ),
        ProviderSpec(
            id="together",
            label="Together AI",
            kind="openai",
            base_url="https://api.together.xyz/v1",
            default_model="openai/gpt-oss-120b",
            fast_model="openai/gpt-oss-20b",
            stream_usage=True,
            key_url="https://api.together.xyz/settings/api-keys",
        ),
        ProviderSpec(
            id="ollama",
            label="Ollama (local)",
            kind="openai",
            base_url="http://localhost:11434/v1",
            default_model="llama3.2",
            fast_model="llama3.2",
            needs_key=False,
            local=True,
            free_tier=True,
        ),
    ]
}

# Order used when falling back. Local providers are never used as a silent fallback
# because a missing Ollama install would only add latency before the real error.
FALLBACK_ORDER = ["groq", "gemini", "mistral", "anthropic", "openai", "openrouter", "together"]
