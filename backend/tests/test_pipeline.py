import asyncio

from wingman.ai.pipeline import AnswerPipeline
from wingman.events import AnswerChunk, AnswerDone, AnswerError, AnswerStarted
from wingman.services.conversations import ConversationStore
from wingman.services.documents import DocumentStore

from .fakes import FakeProvider


def make_pipeline(router, db, notifier, transcript=""):
    return AnswerPipeline(router, ConversationStore(db), DocumentStore(db), notifier, lambda: transcript)


async def test_answer_events_and_persistence(make_router, db, notifier):
    pipeline = make_pipeline(make_router({"groq": FakeProvider("groq", ["Hi", " you"])}), db, notifier)
    answer_id, conv_id = await pipeline.ask("Hello?", mode="work")
    await pipeline.wait()
    started = notifier.of(AnswerStarted)[0]
    assert started.answer_id == answer_id and started.conversation_id == conv_id
    assert "".join(c.text for c in notifier.of(AnswerChunk)) == "Hi you"
    done = notifier.of(AnswerDone)[0]
    assert done.answer == "Hi you" and not done.cancelled and done.provider == "groq"
    history = await ConversationStore(db).history(conv_id)
    assert history == [{"role": "user", "content": "Hello?"}, {"role": "assistant", "content": "Hi you"}]


async def test_new_question_cancels_previous(make_router, db, notifier):
    slow = FakeProvider("groq", ["a"] * 50, delay=0.02)
    pipeline = make_pipeline(make_router({"groq": slow}), db, notifier)
    first, conv = await pipeline.ask("first?", mode="work")
    await asyncio.sleep(0.05)
    slow.chunks, slow.delay = ["second answer"], 0
    second, _ = await pipeline.ask("second?", mode="work", conversation_id=conv)
    await pipeline.wait()
    done = {d.answer_id: d for d in notifier.of(AnswerDone)}
    assert done[first].cancelled and not done[second].cancelled
    assert done[second].answer == "second answer"


async def test_history_and_context_are_sent(make_router, db, notifier):
    fake = FakeProvider("groq", ["ok"])
    pipeline = make_pipeline(make_router({"groq": fake}), db, notifier, transcript="Them: How do you scale Kafka?")
    _, conv = await pipeline.ask("one", mode="interview")
    await pipeline.wait()
    await pipeline.ask("two", mode="interview", conversation_id=conv)
    await pipeline.wait()
    messages = fake.calls[-1][0]
    assert messages[0]["role"] == "system" and "interview" in messages[0]["content"]
    assert any("How do you scale Kafka?" in m["content"] for m in messages)
    assert [m["content"] for m in messages if m["role"] != "system"] == ["one", "ok", "two"]


async def test_provider_error_becomes_answer_error(make_router, db, notifier):
    pipeline = make_pipeline(
        make_router({"groq": FakeProvider("groq", fail_before="Groq rejected the API key.")}, fallback=False),
        db,
        notifier,
    )
    await pipeline.ask("hi?", mode="work")
    await pipeline.wait()
    assert notifier.of(AnswerError)[0].message == "Groq rejected the API key."
    assert notifier.of(AnswerDone) == []
