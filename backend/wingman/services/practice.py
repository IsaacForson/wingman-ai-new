"""Mock-interview practice graded by the LLM, with progress over time.

If grading fails the user gets an error, never a made-up score.
"""

from __future__ import annotations

import json
import random
import uuid
from pathlib import Path

from ..ai import prompts
from ..ai.jsonutil import extract_json
from ..db import Database
from ..providers import ProviderRouter
from .conversations import now
from .documents import DocumentStore

BANK_PATH = Path(__file__).parent / "data" / "practice_questions.json"
CATEGORIES = ("behavioral", "technical", "coding", "system_design")


class GradingFailed(Exception):
    pass


def _clamp(value, lo, hi, default):
    try:
        return max(lo, min(hi, float(value)))
    except (TypeError, ValueError):
        return default


def normalize_feedback(raw: dict, category: str) -> dict:
    def str_list(key):
        items = raw.get(key) or []
        return [str(i).strip() for i in items if str(i).strip()][:6] if isinstance(items, list) else []

    score = raw.get("score")
    if score is None:
        raise GradingFailed("The grader didn't return a score.")
    feedback = {
        "score": round(_clamp(score, 1, 10, 5)),
        "summary": str(raw.get("summary") or "").strip(),
        "strengths": str_list("strengths"),
        "improvements": str_list("improvements"),
        "missed_points": str_list("missed_points"),
        "better_answer_outline": str_list("better_answer_outline"),
        "star": None,
    }
    star = raw.get("star")
    if category == "behavioral" and isinstance(star, dict):
        feedback["star"] = {k: int(_clamp(star.get(k), 0, 3, 0)) for k in ("situation", "task", "action", "result")}
    return feedback


class PracticeService:
    def __init__(self, db: Database, router: ProviderRouter, documents: DocumentStore):
        self.db = db
        self.router = router
        self.documents = documents
        self.bank: list[dict] = json.loads(BANK_PATH.read_text())

    def questions(self, category: str | None = None) -> list[dict]:
        return [q for q in self.bank if not category or q["type"] == category]

    def random_question(self, category: str | None = None, exclude: set[str] | None = None) -> dict:
        pool = [q for q in self.questions(category) if q["id"] not in (exclude or set())] or self.questions(category)
        return random.choice(pool)

    async def generate(self, count: int = 5) -> list[dict]:
        background = await self.documents.profile()
        if not background:
            raise GradingFailed("Add a job description or résumé in Context first.")
        text, _ = await self.router.complete(
            [{"role": "user", "content": prompts.PRACTICE_GENERATE.format(count=count, background=background)}],
            purpose="practice_generate",
            temperature=0.7,
            max_tokens=1500,
        )
        data = extract_json(text)
        out = []
        for q in data.get("questions", [])[:count]:
            category = q.get("category") if q.get("category") in CATEGORIES else "behavioral"
            out.append(
                {
                    "id": f"gen-{uuid.uuid4().hex[:8]}",
                    "question": str(q.get("question", "")).strip(),
                    "category": category,
                    "type": category,
                    "difficulty": "medium",
                    "hints": [],
                    "key_points": [str(k) for k in q.get("key_points", [])][:6],
                }
            )
        return [q for q in out if q["question"]]

    async def grade(
        self,
        *,
        question: str,
        answer: str,
        category: str,
        key_points: list[str] | None = None,
        question_id: str | None = None,
        duration_s: float | None = None,
    ) -> dict:
        answer = answer.strip()
        if len(answer.split()) < 5:
            raise GradingFailed("The answer is too short to grade. Try answering in full sentences.")
        category = category if category in CATEGORIES else "behavioral"
        background = await self.documents.profile()
        prompt = prompts.PRACTICE_GRADE.format(
            category=category.replace("_", " "),
            question=question,
            key_points=", ".join(key_points or []) or "(not specified)",
            background=f"Candidate background:\n{background}\n" if background else "",
            answer=answer[:6000],
            star_shape=prompts.STAR_SHAPE if category == "behavioral" else "null",
        )
        try:
            text, handle = await self.router.complete(
                [{"role": "system", "content": prompts.system_prompt("practice")}, {"role": "user", "content": prompt}],
                purpose="practice_grade",
                temperature=0.2,
                max_tokens=1200,
            )
            feedback = normalize_feedback(extract_json(text), category)
        except ValueError as e:
            raise GradingFailed("The grader's reply couldn't be read. Try again.") from e
        feedback["provider"], feedback["model"] = handle.provider, handle.model
        attempt_id = uuid.uuid4().hex[:12]
        await self.db.execute(
            "INSERT INTO practice_attempts(id, question_id, question, category, answer, score, feedback_json, duration_s, created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (
                attempt_id,
                question_id,
                question,
                category,
                answer,
                feedback["score"],
                json.dumps(feedback),
                duration_s,
                now(),
            ),
        )
        feedback["attempt_id"] = attempt_id
        return feedback

    async def history(self, limit: int = 50) -> list[dict]:
        rows = await self.db.fetchall("SELECT * FROM practice_attempts ORDER BY created_at DESC LIMIT ?", (limit,))
        for r in rows:
            r["feedback"] = json.loads(r.pop("feedback_json"))
        return rows

    async def stats(self) -> dict:
        rows = await self.db.fetchall("SELECT category, score, created_at FROM practice_attempts ORDER BY created_at")
        scores = [r["score"] for r in rows if r["score"] is not None]
        by_cat: dict[str, list[float]] = {}
        for r in rows:
            if r["score"] is not None:
                by_cat.setdefault(r["category"], []).append(r["score"])
        recent, previous = scores[-10:], scores[-20:-10]
        avg = lambda xs: round(sum(xs) / len(xs), 1) if xs else None  # noqa: E731
        return {
            "attempts": len(rows),
            "average": avg(scores),
            "recent_average": avg(recent),
            "previous_average": avg(previous),
            "by_category": {k: {"attempts": len(v), "average": avg(v)} for k, v in by_cat.items()},
            "trend": [{"at": r["created_at"], "score": r["score"]} for r in rows[-30:]],
        }
