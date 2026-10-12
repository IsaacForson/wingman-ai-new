"""Decides whether something the other person said is a question worth answering."""

from __future__ import annotations

import re

_SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+")
_FILLERS = re.compile(
    r"^(?:(?:so|ok|okay|alright|all right|um+|uh+|and|well|now|right|great|cool|yeah|next)[,.]?\s+)+", re.I
)
_WH = re.compile(r"^(what|who|where|when|why|how|which|whose|whom)\b", re.I)
_AUX = re.compile(
    r"^(is|are|was|were|do|does|did|can|could|would|should|will|have|has|had|may|might|shall)\s+"
    r"(you|we|i|it|there|they|this|that|your|the|a|an|he|she)\b",
    re.I,
)
_ASK = re.compile(
    r"^(tell me|tell us|explain|describe|walk me through|walk us through|talk me through|"
    r"give me an example|give an example|share an example|define|compare|"
    r"what's|what is|how would you|how do you|could you|can you|would you|please)\b",
    re.I,
)
_TAGS = {"right?", "you know?", "okay?", "ok?", "yeah?", "correct?", "make sense?", "isn't it?", "right"}


def _clean(sentence: str) -> str:
    return _FILLERS.sub("", sentence.strip())


def is_question_sentence(sentence: str) -> bool:
    s = _clean(sentence)
    words = s.split()
    if len(words) < 3:
        return False
    if s.lower() in _TAGS or (len(words) <= 4 and s.lower().endswith(("right?", "okay?", "you know?"))):
        return False
    return s.endswith("?") or bool(_WH.match(s) or _AUX.match(s) or _ASK.match(s))


def find_question(text: str) -> str | None:
    """Return the utterance trimmed to start at its first question-like sentence, or None."""
    text = " ".join(text.split())
    if len(text) < 8:
        return None
    sentences = [s for s in _SENTENCE_SPLIT.split(text) if s]
    for i, sentence in enumerate(sentences):
        if is_question_sentence(sentence):
            # Keep one sentence of lead-in: "We use Kafka a lot. How would you scale it?"
            start = max(0, i - 1)
            return " ".join(sentences[start:])
    return None
