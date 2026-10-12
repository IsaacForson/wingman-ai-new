import pytest

from wingman.ai.detector import find_question

QUESTIONS = [
    "Tell me about a time you disagreed with your manager.",
    "So, how would you design a URL shortener",
    "Okay great. Walk me through your last project.",
    "We use Kafka heavily here. How would you scale it?",
    "Can you explain the difference between a process and a thread",
    "What's your experience with React?",
]
NOT_QUESTIONS = [
    "Yeah that makes sense.",
    "right?",
    "Thanks, that was helpful.",
    "I worked at Acme for three years.",
    "ok",
]


@pytest.mark.parametrize("text", QUESTIONS)
def test_detects_questions(text):
    assert find_question(text)


@pytest.mark.parametrize("text", NOT_QUESTIONS)
def test_ignores_statements(text):
    assert find_question(text) is None


def test_keeps_one_sentence_of_lead_in():
    text = "Thanks for joining. We use Kafka heavily here. How would you scale it?"
    assert find_question(text) == "We use Kafka heavily here. How would you scale it?"
