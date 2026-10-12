"""Receives PCM from the desktop app, segments it per speaker and transcribes it.

The desktop app captures two channels and sends them separately:
  * ``me``   - the user's microphone
  * ``them`` - system audio (the other side of a call)
Keeping them apart gives speaker labels for free.
"""

from __future__ import annotations

import asyncio
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field

import httpx
from loguru import logger

from ..runtime import RuntimeStore, SecretStore
from .segmenter import Segmenter, SegmentEvent
from .transcribe import Transcriber, TranscriptionError, clean_transcript, select_transcriber
from .vad import SAMPLE_RATE, VoiceActivityDetector

CHANNELS = ("me", "them")
OnText = Callable[[str, str, str, bool], Awaitable[None]]  # speaker, segment_id, text, final


@dataclass
class _Channel:
    name: str
    segmenter: Segmenter
    queue: asyncio.Queue = field(default_factory=asyncio.Queue)
    worker: asyncio.Task | None = None
    partial_task: asyncio.Task | None = None
    segment_ids: dict[int, str] = field(default_factory=dict)
    last_text: str = ""


class AudioService:
    def __init__(
        self,
        runtime: RuntimeStore,
        secrets: SecretStore,
        client: httpx.AsyncClient,
        on_text: OnText,
        on_error: Callable[[str], Awaitable[None]],
    ):
        self.runtime = runtime
        self.secrets = secrets
        self.client = client
        self.on_text = on_text
        self.on_error = on_error
        self._channels: dict[str, _Channel] = {}
        self._cache: dict[str, Transcriber] = {}
        self._last_error = ""

    @property
    def listening(self) -> bool:
        return bool(self._channels)

    @property
    def channels(self) -> list[str]:
        return list(self._channels)

    def transcriber(self) -> Transcriber | None:
        return select_transcriber(self.runtime.config, self.secrets, self.client, self._cache)

    async def start(self, channels: list[str]) -> list[str]:
        await self.stop()
        cfg = self.runtime.config
        for name in channels:
            if name not in CHANNELS:
                continue
            seg = Segmenter(VoiceActivityDetector(cfg.vad_aggressiveness), cfg.endpoint_silence_ms, cfg.live_partials)
            ch = _Channel(name, seg)
            ch.worker = asyncio.create_task(self._worker(ch))
            self._channels[name] = ch
        return self.channels

    async def stop(self) -> None:
        channels, self._channels = self._channels, {}
        for ch in channels.values():
            event = ch.segmenter.flush()
            if event:
                ch.queue.put_nowait(event)
            ch.queue.put_nowait(None)
        for ch in channels.values():
            if ch.partial_task:
                ch.partial_task.cancel()
            if ch.worker:
                try:
                    await asyncio.wait_for(ch.worker, timeout=30)
                except (asyncio.TimeoutError, asyncio.CancelledError):
                    ch.worker.cancel()

    def feed(self, channel: str, pcm: bytes) -> None:
        ch = self._channels.get(channel)
        if ch is None or not pcm:
            return
        for event in ch.segmenter.feed(pcm):
            if event.kind == "final":
                if ch.partial_task:
                    ch.partial_task.cancel()
                ch.queue.put_nowait(event)
            elif ch.queue.empty() and (ch.partial_task is None or ch.partial_task.done()):
                ch.partial_task = asyncio.create_task(self._partial(ch, event))

    def _segment_id(self, ch: _Channel, index: int) -> str:
        return ch.segment_ids.setdefault(index, f"{ch.name}-{uuid.uuid4().hex[:8]}")

    async def _transcribe(self, ch: _Channel, audio: bytes) -> str | None:
        transcriber = self.transcriber()
        if transcriber is None:
            await self._report(
                "Transcription is off or not set up. Add a Groq or OpenAI key, or install local Whisper."
            )
            return None
        try:
            text = await transcriber.transcribe(audio, self.runtime.config.language, prompt=ch.last_text or None)
        except TranscriptionError as e:
            await self._report(str(e))
            return None
        self._last_error = ""
        return clean_transcript(text, len(audio) / 2 / SAMPLE_RATE)

    async def _partial(self, ch: _Channel, event: SegmentEvent) -> None:
        try:
            text = await self._transcribe(ch, event.audio)
            if text:
                await self.on_text(ch.name, self._segment_id(ch, event.segment_index), text, False)
        except asyncio.CancelledError:
            pass

    async def _worker(self, ch: _Channel) -> None:
        while True:
            event = await ch.queue.get()
            if event is None:
                return
            try:
                text = await self._transcribe(ch, event.audio)
                segment_id = self._segment_id(ch, event.segment_index)
                ch.segment_ids.pop(event.segment_index, None)
                if text:
                    ch.last_text = (ch.last_text + " " + text)[-400:]
                await self.on_text(ch.name, segment_id, text or "", True)
            except Exception:  # keep the worker alive whatever happens
                logger.exception("transcription worker error")

    async def _report(self, message: str) -> None:
        if message != self._last_error:  # don't spam the same error for every segment
            self._last_error = message
            await self.on_error(message)
