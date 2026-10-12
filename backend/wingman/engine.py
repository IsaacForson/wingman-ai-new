"""Ties audio, screen, the answer pipeline and the feature services together."""

from __future__ import annotations

import time
from collections import deque

import httpx
from loguru import logger

from .ai import prompts
from .ai.detector import find_question
from .ai.pipeline import AnswerPipeline
from .audio.service import AudioService
from .config import APP_VERSION
from .events import Notice, Notifier, ProviderInfo, StatusEvent, TranscriptEvent
from .providers import PROVIDERS, ProviderRouter
from .runtime import RuntimeStore, RuntimeUpdate, SecretStore
from .screen.service import ScreenService
from .services.conversations import ConversationStore
from .services.documents import DocumentStore
from .services.meetings import MeetingService
from .services.practice import PracticeService

TRANSCRIPT_WINDOW_S = 180
TRANSCRIPT_MAX_CHARS = 3000


class Engine:
    def __init__(
        self,
        *,
        runtime: RuntimeStore,
        secrets: SecretStore,
        router: ProviderRouter,
        conversations: ConversationStore,
        documents: DocumentStore,
        practice: PracticeService,
        meetings: MeetingService,
        screen: ScreenService,
        notifier: Notifier,
        client: httpx.AsyncClient,
    ):
        self.runtime = runtime
        self.secrets = secrets
        self.router = router
        self.conversations = conversations
        self.documents = documents
        self.practice = practice
        self.meetings = meetings
        self.screen = screen
        self.notifier = notifier
        self.paused = False
        self.current_conversation_id: str | None = None
        self._transcript: deque[tuple[float, str, str]] = deque(maxlen=300)
        self.audio = AudioService(runtime, secrets, client, on_text=self._on_text, on_error=self._audio_error)
        self.pipeline = AnswerPipeline(router, conversations, documents, notifier, self.transcript_context)

    # -- status -------------------------------------------------------------
    def status(self) -> StatusEvent:
        cfg = self.runtime.config
        transcriber = self.audio.transcriber()
        return StatusEvent(
            version=APP_VERSION,
            mode=cfg.mode,
            paused=self.paused,
            listening=self.audio.listening,
            provider=cfg.provider,
            model=self.router.resolve_model(cfg.provider),
            providers=[
                ProviderInfo(
                    id=s.id,
                    label=s.label,
                    configured=self.router.is_configured(s.id),
                    local=s.local,
                    free_tier=s.free_tier,
                    default_model=s.default_model,
                    key_url=s.key_url,
                )
                for s in PROVIDERS.values()
            ],
            transcription=transcriber.name if transcriber else None,
            screen_capture=self.screen.available,
            meeting_id=self.meetings.active_id,
        )

    async def broadcast_status(self) -> None:
        await self.notifier.emit(self.status())

    async def notice(self, level: str, message: str) -> None:
        await self.notifier.emit(Notice(level=level, message=message))  # type: ignore[arg-type]

    # -- transcript ---------------------------------------------------------
    def transcript_context(self) -> str:
        cutoff = time.time() - TRANSCRIPT_WINDOW_S
        lines = [f"{'Me' if s == 'me' else 'Them'}: {t}" for ts, s, t in self._transcript if ts >= cutoff]
        text = "\n".join(lines)
        return text[-TRANSCRIPT_MAX_CHARS:]

    def _should_answer(self, speaker: str, text: str) -> str | None:
        cfg = self.runtime.config
        if self.paused or not cfg.auto_answer or cfg.mode == "practice":
            return None
        if speaker == "them":
            return find_question(text)
        # Mic only (no call audio): the user is talking to Wingman directly.
        if speaker == "me" and self.audio.channels == ["me"]:
            return text if len(text.split()) >= 3 else None
        return None

    async def _on_text(self, speaker: str, segment_id: str, text: str, final: bool) -> None:
        await self.notifier.emit(TranscriptEvent(segment_id=segment_id, speaker=speaker, text=text, final=final))  # type: ignore[arg-type]
        if not final or not text:
            return
        self._transcript.append((time.time(), speaker, text))
        await self.meetings.add_line(speaker, text)
        question = self._should_answer(speaker, text)
        if question:
            await self.ask(question, source="audio")

    async def _audio_error(self, message: str) -> None:
        await self.notice("error", message)

    # -- actions ------------------------------------------------------------
    async def ask(
        self, question: str, *, source: str = "manual", conversation_id: str | None = None, mode: str | None = None
    ) -> dict:
        mode = mode or self.runtime.config.mode
        answer_id, conv_id = await self.pipeline.ask(
            question, mode=mode, source=source, conversation_id=conversation_id or self.current_conversation_id
        )
        self.current_conversation_id = conv_id
        return {"answer_id": answer_id, "conversation_id": conv_id}

    def new_conversation(self) -> None:
        self.current_conversation_id = None
        self._transcript.clear()

    async def capture_screen(self) -> dict:
        text = await self.screen.capture_text()
        return await self.ask(prompts.SCREEN_QUESTION.format(text=text), source="screen")

    async def convert_code(self, code: str, src: str, dst: str) -> str:
        text, _ = await self.router.complete(
            [{"role": "user", "content": prompts.CODE_CONVERT.format(src=src, dst=dst, code=code)}],
            purpose="code_convert",
            temperature=0.1,
            max_tokens=4000,
        )
        text = text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1] if "\n" in text else ""
            text = text.rsplit("```", 1)[0]
        return text.strip()

    async def set_paused(self, paused: bool) -> None:
        self.paused = paused
        if paused:
            await self.pipeline.cancel()
        await self.broadcast_status()

    async def update_config(self, update: RuntimeUpdate) -> None:
        old = self.runtime.config
        cfg = await self.runtime.update(update)
        audio_keys = {"vad_aggressiveness", "endpoint_silence_ms", "live_partials"}
        if self.audio.listening and any(getattr(old, k) != getattr(cfg, k) for k in audio_keys):
            await self.audio.start(self.audio.channels)  # restart segmenters with new settings
        if update.mode and self.current_conversation_id:
            await self.conversations.set_mode(self.current_conversation_id, update.mode)
        await self.broadcast_status()

    async def start_listening(self, channels: list[str]) -> list[str]:
        active = await self.audio.start(channels)
        if self.audio.transcriber() is None:
            await self.notice(
                "warning", "Listening, but transcription isn't set up. Add a Groq or OpenAI key in Settings → AI."
            )
        await self.broadcast_status()
        return active

    async def stop_listening(self) -> None:
        await self.audio.stop()
        await self.broadcast_status()

    async def shutdown(self) -> None:
        try:
            await self.audio.stop()
            await self.pipeline.cancel()
        except Exception as e:  # pragma: no cover
            logger.warning("shutdown: {}", e)
