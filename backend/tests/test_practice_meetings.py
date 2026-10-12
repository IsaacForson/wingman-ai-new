import json

import pytest

from wingman.ai.jsonutil import extract_json
from wingman.services.documents import DocumentStore
from wingman.services.meetings import MeetingService
from wingman.services.practice import GradingFailed, PracticeService

from .fakes import FakeProvider

GRADE = {
    "score": 7,
    "summary": "Solid story.",
    "strengths": ["Clear situation"],
    "improvements": ["Quantify the result"],
    "missed_points": ["Lessons learned"],
    "star": {"situation": 3, "task": 2, "action": 3, "result": 1},
    "better_answer_outline": ["Open with the stakes"],
}


def test_extract_json_handles_fences_and_chatter():
    assert extract_json('Sure!\n```json\n{"a": {"b": "}"}}\n```') == {"a": {"b": "}"}}
    assert extract_json('Here you go: {"x": 1} thanks') == {"x": 1}
    with pytest.raises(ValueError):
        extract_json("no json here")


async def test_grading_is_normalized_and_saved(make_router, db):
    router = make_router({"groq": FakeProvider("groq", reply="Here:\n" + json.dumps({**GRADE, "score": 14}))})
    service = PracticeService(db, router, DocumentStore(db))
    fb = await service.grade(
        question="Tell me about a conflict",
        answer="I had a disagreement with a peer about design.",
        category="behavioral",
    )
    assert fb["score"] == 10  # clamped
    assert fb["star"] == {"situation": 3, "task": 2, "action": 3, "result": 1}
    history = await service.history()
    assert history[0]["feedback"]["summary"] == "Solid story."
    stats = await service.stats()
    assert stats["attempts"] == 1 and stats["average"] == 10


async def test_grading_never_invents_a_score(make_router, db):
    service = PracticeService(
        db, make_router({"groq": FakeProvider("groq", reply="I can't grade that")}), DocumentStore(db)
    )
    with pytest.raises(GradingFailed):
        await service.grade(question="q", answer="a reasonably long answer here", category="technical")
    with pytest.raises(GradingFailed):
        await service.grade(question="q", answer="too short", category="technical")
    assert await service.history() == []


async def test_technical_answers_have_no_star(make_router, db):
    router = make_router({"groq": FakeProvider("groq", reply=json.dumps(GRADE))})
    fb = await PracticeService(db, router, DocumentStore(db)).grade(
        question="Explain TCP", answer="TCP is a reliable ordered stream protocol over IP.", category="technical"
    )
    assert fb["star"] is None


async def test_generated_questions_need_background(make_router, db):
    service = PracticeService(db, make_router({"groq": FakeProvider("groq")}), DocumentStore(db))
    with pytest.raises(GradingFailed):
        await service.generate()


SUMMARY = {
    "title": "Q3 planning",
    "summary": "We planned Q3.",
    "key_points": ["Hiring"],
    "decisions": ["Ship v2"],
    "action_items": [{"owner": "Me", "task": "Send the deck", "due": "Friday"}, {"task": ""}],
    "open_questions": [],
    "follow_up_email": {"subject": "Recap", "body": "Thanks all"},
}


async def test_meeting_lifecycle(make_router, db):
    fake = FakeProvider("groq", reply=json.dumps(SUMMARY))
    service = MeetingService(db, make_router({"groq": fake}))
    meeting = await service.start("Planning")
    await service.add_line("them", "Let's ship v2 in Q3.")
    await service.add_line("me", "I'll send the deck by Friday.")
    result = await service.stop()
    assert service.active_id is None
    assert result["title"] == "Q3 planning"
    assert result["summary"]["action_items"] == [{"owner": "Me", "task": "Send the deck", "due": "Friday"}]
    md = await service.export_markdown(meeting["id"])
    assert "- [ ] Send the deck — Me (due Friday)" in md and "**Them:** Let's ship v2 in Q3." in md
    assert "Me: I'll send the deck" in fake.calls[0][0][0]["content"]


async def test_long_meetings_use_map_reduce(make_router, db):
    fake = FakeProvider("groq", reply=json.dumps(SUMMARY))
    service = MeetingService(db, make_router({"groq": fake}))
    await service.start()
    for i in range(400):
        await service.add_line("them", f"Point number {i} " + "detail " * 10)
    await service.stop()
    assert len(fake.calls) > 2
    assert "Partial summaries" in fake.calls[-1][0][0]["content"]


async def test_empty_meeting_cannot_be_summarized(make_router, db):
    service = MeetingService(db, make_router({"groq": FakeProvider("groq")}))
    await service.start()
    with pytest.raises(ValueError, match="Nothing was transcribed"):
        await service.stop()
