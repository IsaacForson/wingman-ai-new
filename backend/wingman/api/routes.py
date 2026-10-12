"""REST API. Everything except /health needs a token (see wingman.security)."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

from ..config import APP_VERSION
from ..providers import PROVIDERS, ProviderError
from ..security import APP_ONLY, APP_OR_EXTENSION
from ..services.documents import UnsupportedDocument, extract_text
from ..services.practice import GradingFailed

public = APIRouter()
api = APIRouter(prefix="/api", dependencies=[APP_ONLY])
extension = APIRouter(prefix="/api/extension", dependencies=[APP_OR_EXTENSION])


def engine(request: Request):
    return request.app.state.engine


@public.get("/health")
async def health():
    return {"status": "ok", "version": APP_VERSION}


# -- status & settings --------------------------------------------------------
@api.get("/status")
async def status(request: Request):
    return engine(request).status()


@api.get("/settings")
async def get_settings(request: Request):
    return engine(request).runtime.config


class SecretUpdate(BaseModel):
    keys: dict[str, str | None]


@api.put("/secrets")
async def put_secrets(body: SecretUpdate, request: Request):
    """Called by the Electron main process only; keys never pass through the UI."""
    secrets = engine(request).secrets
    for provider, key in body.keys.items():
        if provider not in PROVIDERS:
            raise HTTPException(400, f"Unknown provider '{provider}'")
        secrets.set(provider, key)
    await engine(request).broadcast_status()
    return {"configured": sorted(secrets.configured())}


@api.get("/providers/{provider}/models")
async def provider_models(provider: str, request: Request, refresh: bool = False):
    if provider not in PROVIDERS:
        raise HTTPException(404, "Unknown provider")
    return await engine(request).router.list_models(provider, refresh=refresh)


@api.post("/providers/{provider}/test")
async def test_provider(provider: str, request: Request):
    if provider not in PROVIDERS:
        raise HTTPException(404, "Unknown provider")
    try:
        text, handle = await engine(request).router.complete(
            [{"role": "user", "content": "Reply with the single word: ready"}],
            purpose="test",
            provider=provider,
            fallback=False,
            max_tokens=64,
        )
        return {"ok": True, "model": handle.model, "ttft_ms": handle.ttft_ms, "reply": text.strip()[:50]}
    except ProviderError as e:
        return {"ok": False, "error": e.message}


@api.get("/usage")
async def usage(request: Request, days: int = 7):
    return await engine(request).router.usage.summary(days)


@api.get("/extension-token")
async def extension_token(request: Request, rotate: bool = False):
    tokens = request.app.state.tokens
    return {"token": tokens.rotate_extension_token() if rotate else tokens.extension_token}


# -- conversations ------------------------------------------------------------
@api.get("/conversations")
async def list_conversations(request: Request, q: str | None = None):
    return await engine(request).conversations.list(query=q)


@api.get("/conversations/{conv_id}")
async def get_conversation(conv_id: str, request: Request):
    conv = await engine(request).conversations.get(conv_id)
    if not conv:
        raise HTTPException(404, "Conversation not found")
    return conv


@api.get("/conversations/{conv_id}/export", response_class=PlainTextResponse)
async def export_conversation(conv_id: str, request: Request):
    md = await engine(request).conversations.export_markdown(conv_id)
    if md is None:
        raise HTTPException(404, "Conversation not found")
    return md


@api.delete("/conversations/{conv_id}")
async def delete_conversation(conv_id: str, request: Request):
    e = engine(request)
    if e.current_conversation_id == conv_id:
        e.new_conversation()
    return {"deleted": await e.conversations.delete(conv_id)}


@api.delete("/conversations")
async def delete_all_conversations(request: Request):
    await engine(request).conversations.delete_all()
    engine(request).new_conversation()
    return {"deleted": True}


class Feedback(BaseModel):
    rating: Literal[-1, 1] | None


@api.put("/answers/{answer_id}/feedback")
async def answer_feedback(answer_id: str, body: Feedback, request: Request):
    await engine(request).conversations.set_feedback(answer_id, body.rating)
    return {"ok": True}


# -- context documents --------------------------------------------------------
@api.get("/documents")
async def list_documents(request: Request):
    return await engine(request).documents.list()


@api.post("/documents")
async def upload_document(
    request: Request,
    kind: Literal["resume", "job_description", "notes"] = Form(...),
    file: UploadFile | None = File(None),
    text: str | None = Form(None),
    name: str | None = Form(None),
):
    try:
        if file is not None:
            content = extract_text(file.filename or "upload.txt", await file.read())
            doc_name = name or file.filename or "Document"
        elif text and text.strip():
            content, doc_name = text.strip(), name or "Pasted text"
        else:
            raise HTTPException(400, "Upload a file or paste some text.")
    except UnsupportedDocument as e:
        raise HTTPException(400, str(e)) from e
    return await engine(request).documents.add(kind, doc_name, content)


class DocumentPatch(BaseModel):
    active: bool


@api.patch("/documents/{doc_id}")
async def patch_document(doc_id: str, body: DocumentPatch, request: Request):
    if not await engine(request).documents.set_active(doc_id, body.active):
        raise HTTPException(404, "Document not found")
    return {"ok": True}


@api.delete("/documents/{doc_id}")
async def delete_document(doc_id: str, request: Request):
    return {"deleted": await engine(request).documents.delete(doc_id)}


# -- practice -----------------------------------------------------------------
@api.get("/practice/questions")
async def practice_questions(request: Request, category: str | None = None):
    return engine(request).practice.questions(category)


@api.post("/practice/questions/generate")
async def generate_questions(request: Request, count: int = 5):
    try:
        return await engine(request).practice.generate(max(1, min(count, 10)))
    except (GradingFailed, ValueError) as e:
        raise HTTPException(400, str(e)) from e
    except ProviderError as e:
        raise HTTPException(502, e.message) from e


class GradeRequest(BaseModel):
    question: str
    answer: str
    category: str = "behavioral"
    key_points: list[str] = Field(default_factory=list)
    question_id: str | None = None
    duration_s: float | None = None


@api.post("/practice/grade")
async def grade(body: GradeRequest, request: Request):
    try:
        return await engine(request).practice.grade(**body.model_dump())
    except GradingFailed as e:
        raise HTTPException(400, str(e)) from e
    except ProviderError as e:
        raise HTTPException(502, e.message) from e


@api.get("/practice/history")
async def practice_history(request: Request, limit: int = 50):
    return await engine(request).practice.history(limit)


@api.get("/practice/stats")
async def practice_stats(request: Request):
    return await engine(request).practice.stats()


# -- meetings -----------------------------------------------------------------
class MeetingStart(BaseModel):
    title: str = ""


@api.post("/meetings")
async def start_meeting(body: MeetingStart, request: Request):
    result = await engine(request).meetings.start(body.title)
    await engine(request).broadcast_status()
    return result


@api.post("/meetings/{meeting_id}/stop")
async def stop_meeting(meeting_id: str, request: Request):
    e = engine(request)
    try:
        result = await e.meetings.stop(meeting_id)
    except ValueError as err:
        await e.broadcast_status()
        raise HTTPException(400, str(err)) from err
    except ProviderError as err:
        await e.broadcast_status()
        raise HTTPException(502, f"Meeting saved, but the summary failed: {err.message}") from err
    await e.broadcast_status()
    return result


@api.post("/meetings/{meeting_id}/summarize")
async def resummarize(meeting_id: str, request: Request):
    try:
        return await engine(request).meetings.summarize(meeting_id)
    except ValueError as err:
        raise HTTPException(400, str(err)) from err
    except ProviderError as err:
        raise HTTPException(502, err.message) from err


@api.get("/meetings")
async def list_meetings(request: Request):
    return await engine(request).meetings.list()


@api.get("/meetings/{meeting_id}")
async def get_meeting(meeting_id: str, request: Request):
    m = await engine(request).meetings.get(meeting_id)
    if not m:
        raise HTTPException(404, "Meeting not found")
    return m


@api.get("/meetings/{meeting_id}/export", response_class=PlainTextResponse)
async def export_meeting(meeting_id: str, request: Request):
    md = await engine(request).meetings.export_markdown(meeting_id)
    if md is None:
        raise HTTPException(404, "Meeting not found")
    return md


@api.delete("/meetings/{meeting_id}")
async def delete_meeting(meeting_id: str, request: Request):
    deleted = await engine(request).meetings.delete(meeting_id)
    await engine(request).broadcast_status()
    return {"deleted": deleted}


# -- browser extension --------------------------------------------------------
class ExplainRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=20000)
    instruction: Literal["explain", "summarize", "reply"] = "explain"
    page_title: str | None = None


EXTENSION_PROMPTS = {
    "explain": "Explain this clearly and concisely:",
    "summarize": "Summarize this in a few bullet points:",
    "reply": "Draft a short, friendly reply to this:",
}


@extension.get("/ping")
async def extension_ping():
    """Lets the extension check its pairing key without spending an LLM call."""
    return {"ok": True, "version": APP_VERSION}


@extension.post("/explain")
async def extension_explain(body: ExplainRequest, request: Request):
    """Used by the browser extension for text the user selected. The answer is
    returned to the extension and shown there, in the browser."""
    source = f" (from the page '{body.page_title}')" if body.page_title else ""
    prompt = f"{EXTENSION_PROMPTS[body.instruction]}{source}\n\n{body.text}"
    try:
        text, handle = await engine(request).router.complete(
            [
                {"role": "system", "content": "You are a helpful assistant. Be concise and use markdown sparingly."},
                {"role": "user", "content": prompt},
            ],
            purpose="extension",
            max_tokens=900,
        )
    except ProviderError as e:
        raise HTTPException(502, e.message) from e
    return {"answer": text, "provider": handle.provider, "model": handle.model}
