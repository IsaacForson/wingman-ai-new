import json
import time

from wingman.events import TranscriptEvent


def wait_idle(engine, timeout=2.0):
    end = time.time() + timeout
    while engine.pipeline.busy and time.time() < end:
        time.sleep(0.01)


def test_status_lists_providers(client):
    status = client.get("/api/status").json()
    ids = [p["id"] for p in status["providers"]]
    assert {"groq", "gemini", "mistral", "anthropic", "openai", "ollama"} <= set(ids)
    assert status["screen_capture"] is True


def test_secrets_update_configured_providers(client):
    r = client.put("/api/secrets", json={"keys": {"mistral": "abc", "groq": None}})
    assert "mistral" in r.json()["configured"]
    assert client.put("/api/secrets", json={"keys": {"bogus": "x"}}).status_code == 400
    providers = {p["id"]: p for p in client.get("/api/status").json()["providers"]}
    assert providers["mistral"]["configured"]


def test_runtime_update_validates(client):
    engine = client.engine
    import asyncio

    from wingman.runtime import RuntimeUpdate

    loop_result = client.portal.call(engine.update_config, RuntimeUpdate(temperature=0.9, mode="study"))
    assert loop_result is None
    assert client.get("/api/settings").json()["temperature"] == 0.9
    try:
        RuntimeUpdate.model_validate({"temprature": 1})
        raise AssertionError("unknown field accepted")
    except Exception as e:
        assert "temprature" in str(e)
    del asyncio


def test_ask_creates_conversation_with_feedback(client):
    engine = client.engine
    result = client.portal.call(lambda: engine.ask("What is 6 x 7?"))
    wait_idle(engine)
    convs = client.get("/api/conversations").json()
    assert convs[0]["id"] == result["conversation_id"] and convs[0]["message_count"] == 2
    assert client.put(f"/api/answers/{result['answer_id']}/feedback", json={"rating": 1}).status_code == 200
    conv = client.get(f"/api/conversations/{result['conversation_id']}").json()
    assert conv["messages"][1]["rating"] == 1 and conv["title"] == "What is 6 x 7?"
    md = client.get(f"/api/conversations/{result['conversation_id']}/export").text
    assert "The answer is 42." in md
    assert client.get("/api/conversations", params={"q": "6 x 7"}).json()
    assert client.delete(f"/api/conversations/{result['conversation_id']}").json()["deleted"]


def test_document_upload_and_toggle(client):
    r = client.post("/api/documents", data={"kind": "notes", "text": "Remember to mention Kafka.", "name": "prep"})
    doc = r.json()
    assert doc["chunks"] == 1
    r = client.post("/api/documents", data={"kind": "resume"}, files={"file": ("cv.png", b"x", "image/png")})
    assert r.status_code == 400 and "PDF" in r.json()["detail"]
    assert client.patch(f"/api/documents/{doc['id']}", json={"active": False}).status_code == 200
    assert client.get("/api/documents").json()[0]["active"] is False


def test_practice_endpoints(client, fake_provider):
    fake_provider.chunks = [json.dumps({"score": 6, "summary": "ok", "star": None})]
    qs = client.get("/api/practice/questions", params={"category": "behavioral"}).json()
    assert qs and all(q["type"] == "behavioral" for q in qs)
    r = client.post(
        "/api/practice/grade",
        json={
            "question": qs[0]["question"],
            "answer": "I once led a migration project end to end.",
            "category": "technical",
        },
    )
    assert r.status_code == 200 and r.json()["score"] == 6
    assert client.get("/api/practice/stats").json()["attempts"] == 1
    assert client.post("/api/practice/grade", json={"question": "q", "answer": "short"}).status_code == 400


def test_meeting_endpoints(client, fake_provider):
    m = client.post("/api/meetings", json={"title": "Sync"}).json()
    assert client.get("/api/status").json()["meeting_id"] == m["id"]
    client.portal.call(client.engine.meetings.add_line, "them", "We agreed to ship Friday.")
    fake_provider.chunks = [json.dumps({"title": "Ship sync", "summary": "Ship Friday", "action_items": []})]
    r = client.post(f"/api/meetings/{m['id']}/stop")
    assert r.status_code == 200 and r.json()["summary"]["summary"] == "Ship Friday"
    assert client.get("/api/status").json()["meeting_id"] is None
    assert "Ship Friday" in client.get(f"/api/meetings/{m['id']}/export").text


def test_usage_endpoint(client):
    client.portal.call(lambda: client.engine.ask("hello there?"))
    wait_idle(client.engine)
    usage = client.get("/api/usage").json()
    assert usage["models"][0]["provider"] == "groq"


def test_auto_answer_rules(client):
    engine = client.engine
    engine.audio._channels = {"me": object(), "them": object()}  # simulate a call
    assert engine._should_answer("them", "How would you design a cache?")
    assert engine._should_answer("me", "How would you design a cache?") is None  # user's own speech in a call
    assert engine._should_answer("them", "Yeah that sounds good.") is None
    engine.audio._channels = {"me": object()}  # mic only: talking to Wingman
    assert engine._should_answer("me", "summarize the last point please")
    engine.paused = True
    assert engine._should_answer("me", "summarize the last point please") is None
    engine.paused = False
    engine.audio._channels = {}


def test_transcript_feeds_meeting_and_answers(client):
    engine = client.engine
    events = []

    class Capture:
        async def emit(self, payload):
            events.append(payload)

    engine.notifier = engine.pipeline.notifier = Capture()
    engine.audio._channels = {"me": object(), "them": object()}
    client.portal.call(engine._on_text, "them", "seg1", "Can you walk me through your last project?", True)
    wait_idle(engine)
    engine.audio._channels = {}
    assert isinstance(events[0], TranscriptEvent)
    assert any(getattr(e, "answer", None) == "The answer is 42." for e in events)
    assert "Them: Can you walk me through" in engine.transcript_context()


async def test_imports_v1_history(db, tmp_path):
    import json

    from wingman.services.conversations import ConversationStore, import_v1

    legacy = tmp_path / "conversations.json"
    legacy.write_text(
        json.dumps(
            {
                "conversations": [
                    {
                        "id": "old1",
                        "mode": "study",
                        "title": "Photosynthesis",
                        "created_at": "2025-01-01T10:00:00",
                        "updated_at": "2025-01-01T10:05:00",
                        "messages": [
                            {"role": "user", "content": "What is photosynthesis?", "timestamp": "2025-01-01T10:00:00"},
                            {
                                "role": "assistant",
                                "content": "Plants turning light into sugar.",
                                "timestamp": "2025-01-01T10:00:05",
                            },
                        ],
                    }
                ]
            }
        )
    )
    store = ConversationStore(db)
    assert await import_v1(store, legacy) == 1
    assert not legacy.exists() and (tmp_path / "conversations.json.imported").exists()
    conv = await store.get("old1")
    assert conv["mode"] == "study" and [m["role"] for m in conv["messages"]] == ["user", "assistant"]
    assert await import_v1(store, legacy) == 0
