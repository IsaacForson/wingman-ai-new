from __future__ import annotations

import numpy as np

try:
    import webrtcvad  # provided by the webrtcvad-wheels package
except ImportError:  # pragma: no cover - optional
    webrtcvad = None

SAMPLE_RATE = 16000
FRAME_MS = 30
FRAME_BYTES = SAMPLE_RATE * FRAME_MS // 1000 * 2  # 16-bit mono


class VoiceActivityDetector:
    """WebRTC VAD on 30 ms frames, with an energy-based fallback."""

    def __init__(self, aggressiveness: int = 2, energy_threshold: float = 450.0):
        self.aggressiveness = max(0, min(3, aggressiveness))
        self.energy_threshold = energy_threshold
        self._vad = webrtcvad.Vad(self.aggressiveness) if webrtcvad else None

    @property
    def backend(self) -> str:
        return "webrtc" if self._vad else "energy"

    def is_speech(self, frame: bytes) -> bool:
        if len(frame) != FRAME_BYTES:
            return False
        if self._vad is not None:
            try:
                return self._vad.is_speech(frame, SAMPLE_RATE)
            except Exception:
                pass
        samples = np.frombuffer(frame, dtype=np.int16).astype(np.float32)
        return float(np.sqrt(np.mean(samples * samples))) > self.energy_threshold
