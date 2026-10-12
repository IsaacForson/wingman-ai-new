"""Answers questions one at a time.

A new question cancels the answer in progress instead of being dropped, and
every event carries an ``answer_id`` so the UI can never append chunks to the
wrong answer.
"""

from __future__ import annotations

import asyncio
import time
import uuid
from collections.abc import Callable

from loguru import logger

from ..events import AnswerChunk, AnswerDone, AnswerError, AnswerStarted, Notifier
from ..providers import ProviderError, ProviderRouter
from ..services.conversations import ConversationStore
from ..services.documents import DocumentStore
from . import prompts

CHUNK_FLUSH_SECONDS = 0.03  # coalesce tiny deltas into ~30 fps UI updates


class AnswerPipeline:
    def __init__(
        self,
        router: ProviderRouter,
        conversations: ConversationStore,
        documents: DocumentStore,
        notifier: Notifier,
        transcript_context: Callable[[], str] = lambda: "",
    ):
        self.router = router
        self.conversations = conversations
        self.documents = documents
        self.notifier = notifier
        self.transcript_context = transcript_context
        self._task: asyncio.Task | None = None
        self._current_id: str | None = None

    @property
    def busy(self) -> bool:
        return self._task is not None and not self._task.done()

    async def cancel(self, answer_id: str | None = None) -> bool:
        if not self.busy or (answer_id and answer_id != self._current_id):
            return False
        task = self._task
        assert task is not None
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        return True

    async def ask(
        self, question: str, *, mode: str, source: str = "manual", conversation_id: str | None = None
    ) -> tuple[str, str]:
        question = question.strip()
        if not question:
            raise ValueError("Question is empty.")
        await self.cancel()
        if not conversation_id or not await self.conversations.exists(conversation_id):
            conversation_id = await self.conversations.create(mode)
        answer_id = uuid.uuid4().hex[:12]
        self._current_id = answer_id
        self._task = asyncio.create_task(self._run(answer_id, question, mode, source, conversation_id))
        return answer_id, conversation_id

    async def wait(self) -> None:
        if self._task:
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def _build_messages(self, question: str, mode: str, conversation_id: str) -> list[dict]:
        history = await self.conversations.history(conversation_id, limit=10)
        try:
            docs = await self.documents.context_for(question)
        except Exception as e:  # context is optional; never block an answer on it
            logger.warning("context lookup failed: {}", e)
            docs = ""
        messages = [{"role": "system", "content": prompts.system_prompt(mode)}]
        context = prompts.context_block(docs, self.transcript_context())
        if context:
            messages.append({"role": "system", "content": context})
        messages += history
        messages.append({"role": "user", "content": question})
        return messages

    async def _run(self, answer_id: str, question: str, mode: str, source: str, conversation_id: str) -> None:
        started = time.perf_counter()
        await self.notifier.emit(
            AnswerStarted(
                answer_id=answer_id,
                question=question,
                source=source,  # type: ignore[arg-type]
                conversation_id=conversation_id,
                mode=mode,  # type: ignore[arg-type]
            )
        )
        messages = await self._build_messages(question, mode, conversation_id)
        await self.conversations.add_message(conversation_id, "user", question, source=source, answer_id=answer_id)
        handle = self.router.stream(messages, purpose="answer")
        buffer, last_flush = "", time.perf_counter()
        try:
            async for chunk in handle:
                buffer += chunk
                if time.perf_counter() - last_flush >= CHUNK_FLUSH_SECONDS:
                    await self.notifier.emit(AnswerChunk(answer_id=answer_id, text=buffer))
                    buffer, last_flush = "", time.perf_counter()
            if buffer:
                await self.notifier.emit(AnswerChunk(answer_id=answer_id, text=buffer))
        except asyncio.CancelledError:
            if handle.text:
                await self.conversations.add_message(
                    conversation_id,
                    "assistant",
                    handle.text + "\n\n_(stopped)_",
                    answer_id=answer_id,
                    provider=handle.provider,
                    model=handle.model,
                )
            await self.notifier.emit(self._done(answer_id, handle, started, cancelled=True))
            raise
        except ProviderError as e:
            await self.notifier.emit(AnswerError(answer_id=answer_id, message=e.message))
            return
        except Exception as e:  # pragma: no cover - defensive
            logger.exception("answer failed")
            await self.notifier.emit(AnswerError(answer_id=answer_id, message=f"Something went wrong: {e}"))
            return
        await self.conversations.add_message(
            conversation_id, "assistant", handle.text, answer_id=answer_id, provider=handle.provider, model=handle.model
        )
        await self.notifier.emit(self._done(answer_id, handle, started, cancelled=False))

    @staticmethod
    def _done(answer_id, handle, started, cancelled: bool) -> AnswerDone:
        return AnswerDone(
            answer_id=answer_id,
            answer=handle.text,
            provider=handle.provider,
            model=handle.model,
            ttft_ms=handle.ttft_ms,
            total_ms=round((time.perf_counter() - started) * 1000, 1),
            cancelled=cancelled,
            fell_back_from=handle.fell_back_from,
        )
