import numpy as np

from wingman.audio.segmenter import Segmenter
from wingman.audio.vad import SAMPLE_RATE, VoiceActivityDetector


def energy_vad():
    vad = VoiceActivityDetector()
    vad._vad = None  # force the deterministic energy fallback
    return vad


def tone(seconds, amp):
    t = np.arange(int(SAMPLE_RATE * seconds)) / SAMPLE_RATE
    return (np.sin(2 * np.pi * 220 * t) * amp).astype(np.int16).tobytes()


def feed_all(seg, pcm, step=3200):
    events = []
    for i in range(0, len(pcm), step):
        events += seg.feed(pcm[i : i + step])
    return events


def test_one_utterance_one_final_segment():
    seg = Segmenter(energy_vad(), endpoint_silence_ms=600, partials=False)
    events = feed_all(seg, tone(0.5, 0) + tone(1.2, 8000) + tone(1.0, 0))
    finals = [e for e in events if e.kind == "final"]
    assert len(finals) == 1
    seconds = len(finals[0].audio) / 2 / SAMPLE_RATE
    assert 1.2 <= seconds <= 1.9  # speech + pre-roll + short tail


def test_short_blip_is_dropped():
    seg = Segmenter(energy_vad(), endpoint_silence_ms=500, partials=False)
    assert [e for e in feed_all(seg, tone(0.2, 8000) + tone(1.0, 0)) if e.kind == "final"] == []


def test_partials_while_speaking():
    seg = Segmenter(energy_vad(), endpoint_silence_ms=600, partials=True)
    events = feed_all(seg, tone(4.0, 8000) + tone(1.0, 0))
    kinds = [e.kind for e in events]
    assert kinds.count("partial") >= 2 and kinds[-1] == "final"
    assert len({e.segment_index for e in events}) == 1


def test_flush_closes_open_segment():
    seg = Segmenter(energy_vad(), partials=False)
    feed_all(seg, tone(1.0, 8000))
    event = seg.flush()
    assert event is not None and event.kind == "final"


def test_odd_sized_chunks_are_buffered():
    seg = Segmenter(energy_vad(), endpoint_silence_ms=500, partials=False)
    events = feed_all(seg, tone(1.0, 8000) + tone(1.0, 0), step=777)
    assert len([e for e in events if e.kind == "final"]) == 1
