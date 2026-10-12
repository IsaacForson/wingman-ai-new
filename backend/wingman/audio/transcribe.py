"""Speech-to-text backends behind one interface."""

from __future__ import annotations

import asyncio
import io
import re
import wave
from typing import Protocol

import httpx
from loguru import logger

from ..runtime import RuntimeConfig, SecretStore
from .vad import SAMPLE_RATE

# Whisper invents these on near-silent audio.
_HALLUCINATIONS = re.compile(
    r"^(thank you\.?|thanks( for watching)?[.!]?|you\.?|bye\.?|\.+|subtitles by .*|"
    r"please subscribe.*|okay\.?)$",
    re.I,
)


def clean_transcript(text: str, seconds: float) -> str:
    text = " ".join(text.split())
    if seconds < 2.5 and _HALLUCINATIONS.match(text):
        return ""
    return text


def pcm_to_wav(pcm: bytes, sample_rate: int = SAMPLE_RATE) -> bytes:
    buf = io.BytesIO()
    with wave.open(buf, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(pcm)
    return buf.getvalue()


class TranscriptionError(Exception):
    pass


class Transcriber(Protocol):
    name: str

    async def transcribe(self, pcm: bytes, language: str, prompt: str | None = None) -> str: ...


class CloudWhisper:
    def __init__(self, name: str, url: str, model: str, api_key: str, client: httpx.AsyncClient):
        self.name, self.url, self.model, self.api_key, self.client = name, url, model, api_key, client

    async def transcribe(self, pcm: bytes, language: str, prompt: str | None = None) -> str:
        data = {"model": self.model, "response_format": "json", "temperature": "0"}
        if language and language != "auto":
            data["language"] = language
        if prompt:
            data["prompt"] = prompt[-400:]
        files = {"file": ("audio.wav", pcm_to_wav(pcm), "audio/wav")}
        try:
            resp = await self.client.post(
                self.url, data=data, files=files, headers={"Authorization": f"Bearer {self.api_key}"}, timeout=30
            )
        except httpx.HTTPError as e:
            raise TranscriptionError(f"{self.name} transcription unreachable: {e}") from e
        if resp.status_code != 200:
            raise TranscriptionError(f"{self.name} transcription failed (HTTP {resp.status_code}): {resp.text[:160]}")
        return resp.json().get("text", "")


class LocalWhisper:
    """faster-whisper running on this machine (pip install -r requirements-local.txt)."""

    def __init__(self, size: str):
        self.name = f"local-{size}"
        self.size = size
        self._model = None
        self._lock = asyncio.Lock()

    @staticmethod
    def available() -> bool:
        try:
            import faster_whisper  # noqa: F401
        except ImportError:
            return False
        return True

    async def _load(self):
        async with self._lock:
            if self._model is None:
                from faster_whisper import WhisperModel

                logger.info("Loading local Whisper model '{}' (first use can take a while)", self.size)
                self._model = await asyncio.to_thread(WhisperModel, self.size, device="auto", compute_type="int8")
        return self._model

    async def transcribe(self, pcm: bytes, language: str, prompt: str | None = None) -> str:
        import numpy as np

        model = await self._load()
        audio = np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0

        def run() -> str:
            segments, _ = model.transcribe(
                audio, language=None if language == "auto" else language, initial_prompt=prompt, vad_filter=False
            )
            return " ".join(s.text for s in segments)

        return await asyncio.to_thread(run)


def select_transcriber(
    config: RuntimeConfig, secrets: SecretStore, client: httpx.AsyncClient, cache: dict[str, Transcriber]
) -> Transcriber | None:
    choice = config.transcription
    if choice == "off":
        return None
    order = [choice] if choice != "auto" else ["groq", "openai", "local"]
    for option in order:
        if option == "groq" and (key := secrets.get("groq")):
            return CloudWhisper(
                "groq", "https://api.groq.com/openai/v1/audio/transcriptions", "whisper-large-v3", key, client
            )
        if option == "openai" and (key := secrets.get("openai")):
            return CloudWhisper("openai", "https://api.openai.com/v1/audio/transcriptions", "whisper-1", key, client)
        if option == "local" and LocalWhisper.available():
            cache_key = f"local-{config.local_whisper_model}"
            if cache_key not in cache:
                cache[cache_key] = LocalWhisper(config.local_whisper_model)
            return cache[cache_key]
    return None
