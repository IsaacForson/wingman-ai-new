"""Turns a continuous PCM stream into speech segments using VAD endpointing."""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass, field

from .vad import FRAME_BYTES, FRAME_MS, VoiceActivityDetector

PREROLL_MS = 300
START_MS = 90  # consecutive speech needed to open a segment
MIN_SPEECH_MS = 350  # shorter segments are dropped (coughs, clicks)
MAX_SEGMENT_MS = 25_000
PARTIAL_EVERY_MS = 1500


@dataclass
class SegmentEvent:
    kind: str  # "partial" | "final"
    segment_index: int
    audio: bytes
    forced: bool = False


@dataclass
class _State:
    in_speech: bool = False
    preroll: deque = field(default_factory=lambda: deque(maxlen=PREROLL_MS // FRAME_MS))
    frames: list = field(default_factory=list)
    run_ms: int = 0
    silence_ms: int = 0
    speech_ms: int = 0
    since_partial_ms: int = 0
    index: int = 0
    remainder: bytes = b""


class Segmenter:
    def __init__(self, vad: VoiceActivityDetector, endpoint_silence_ms: int = 700, partials: bool = True):
        self.vad = vad
        self.endpoint_silence_ms = endpoint_silence_ms
        self.partials = partials
        self.s = _State()

    def feed(self, pcm: bytes) -> list[SegmentEvent]:
        data = self.s.remainder + pcm
        cut = len(data) - len(data) % FRAME_BYTES
        self.s.remainder = data[cut:]
        events: list[SegmentEvent] = []
        for i in range(0, cut, FRAME_BYTES):
            event = self._frame(data[i : i + FRAME_BYTES])
            if event:
                events.append(event)
        return events

    def _frame(self, frame: bytes) -> SegmentEvent | None:
        s = self.s
        speech = self.vad.is_speech(frame)
        if not s.in_speech:
            s.preroll.append(frame)
            s.run_ms = s.run_ms + FRAME_MS if speech else 0
            if s.run_ms >= START_MS:
                s.in_speech = True
                s.frames = list(s.preroll)
                s.preroll.clear()
                s.speech_ms = s.run_ms
                s.silence_ms = s.since_partial_ms = 0
            return None

        s.frames.append(frame)
        s.since_partial_ms += FRAME_MS
        if speech:
            s.speech_ms += FRAME_MS
            s.silence_ms = 0
        else:
            s.silence_ms += FRAME_MS

        if s.silence_ms >= self.endpoint_silence_ms:
            return self._close(forced=False)
        if len(s.frames) * FRAME_MS >= MAX_SEGMENT_MS:
            return self._close(forced=True)
        if self.partials and s.since_partial_ms >= PARTIAL_EVERY_MS:
            s.since_partial_ms = 0
            return SegmentEvent("partial", s.index, b"".join(s.frames))
        return None

    def _close(self, forced: bool) -> SegmentEvent | None:
        s = self.s
        # Keep ~200 ms of the trailing silence; Whisper does better with a little tail.
        keep_tail = min(len(s.frames), max(0, s.silence_ms // FRAME_MS - 200 // FRAME_MS))
        frames = s.frames[: len(s.frames) - keep_tail] if keep_tail else s.frames
        speech_ms = s.speech_ms
        index = s.index
        s.in_speech, s.frames, s.run_ms, s.silence_ms, s.speech_ms = False, [], 0, 0, 0
        s.index += 1
        if speech_ms < MIN_SPEECH_MS:
            return None
        return SegmentEvent("final", index, b"".join(frames), forced=forced)

    def flush(self) -> SegmentEvent | None:
        if self.s.in_speech:
            return self._close(forced=True)
        return None
