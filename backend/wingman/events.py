"""Server -> client events.

These pydantic models are the single source of truth for the Socket.IO
contract. ``scripts/gen_types.py`` turns them into TypeScript, and CI fails if
the generated file is out of date, so the two sides cannot silently drift.
"""

from __future__ import annotations

from typing import Literal, Protocol

from pydantic import BaseModel, ConfigDict

Speaker = Literal["me", "them"]
Mode = Literal["interview", "study", "work", "meeting", "research", "practice"]
AnswerSource = Literal["audio", "manual", "screen", "extension", "regenerate"]


class ProviderInfo(BaseModel):
    id: str
    label: str
    configured: bool
    local: bool
    free_tier: bool
    default_model: str
    key_url: str


class StatusEvent(BaseModel):
    version: str
    mode: Mode
    paused: bool
    listening: bool
    provider: str
    model: str
    providers: list[ProviderInfo]
    transcription: str | None  # name of the active transcriber, None if unavailable
    screen_capture: bool
    meeting_id: str | None


class TranscriptEvent(BaseModel):
    segment_id: str
    speaker: Speaker
    text: str
    final: bool


class AnswerStarted(BaseModel):
    answer_id: str
    question: str
    source: AnswerSource
    conversation_id: str
    mode: Mode


class AnswerChunk(BaseModel):
    answer_id: str
    text: str


class AnswerDone(BaseModel):
    model_config = ConfigDict(json_schema_serialization_defaults_required=True)

    answer_id: str
    answer: str
    provider: str | None
    model: str | None
    ttft_ms: float | None
    total_ms: float
    cancelled: bool
    fell_back_from: str | None = None


class AnswerError(BaseModel):
    answer_id: str
    message: str


class Notice(BaseModel):
    level: Literal["info", "warning", "error"]
    message: str


EVENTS: dict[str, type[BaseModel]] = {
    "status": StatusEvent,
    "transcript": TranscriptEvent,
    "answer_started": AnswerStarted,
    "answer_chunk": AnswerChunk,
    "answer_done": AnswerDone,
    "answer_error": AnswerError,
    "notice": Notice,
}
_EVENT_FOR_MODEL = {model: name for name, model in EVENTS.items()}


class Notifier(Protocol):
    async def emit(self, payload: BaseModel) -> None: ...


def event_name(payload: BaseModel) -> str:
    try:
        return _EVENT_FOR_MODEL[type(payload)]
    except KeyError:  # pragma: no cover - programming error
        raise TypeError(f"{type(payload).__name__} is not a registered event") from None


class RecordingNotifier:
    """Notifier used in tests and as a no-op default."""

    def __init__(self) -> None:
        self.events: list[tuple[str, BaseModel]] = []

    async def emit(self, payload: BaseModel) -> None:
        self.events.append((event_name(payload), payload))

    def of(self, model: type[BaseModel]) -> list:
        return [p for _, p in self.events if isinstance(p, model)]
