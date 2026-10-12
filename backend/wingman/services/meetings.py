"""Meeting capture: transcript lines while active, then an LLM write-up."""

from __future__ import annotations

import json
import uuid

from ..ai import prompts
from ..ai.jsonutil import extract_json
from ..db import Database
from ..providers import ProviderRouter
from .conversations import now

CHUNK_CHARS = 12000


def split_transcript(lines: list[str], size: int = CHUNK_CHARS) -> list[str]:
    chunks, current = [], ""
    for line in lines:
        if len(current) + len(line) + 1 > size and current:
            chunks.append(current)
            current = ""
        current += line + "\n"
    if current:
        chunks.append(current)
    return chunks


def normalize_summary(raw: dict) -> dict:
    def str_list(key):
        v = raw.get(key)
        return [str(x).strip() for x in v if str(x).strip()] if isinstance(v, list) else []

    actions = []
    for a in raw.get("action_items") or []:
        if isinstance(a, dict) and a.get("task"):
            actions.append({"owner": str(a.get("owner") or ""), "task": str(a["task"]), "due": a.get("due") or None})
    email = raw.get("follow_up_email") if isinstance(raw.get("follow_up_email"), dict) else {}
    return {
        "title": str(raw.get("title") or "").strip(),
        "summary": str(raw.get("summary") or "").strip(),
        "key_points": str_list("key_points"),
        "decisions": str_list("decisions"),
        "action_items": actions,
        "open_questions": str_list("open_questions"),
        "follow_up_email": {"subject": str(email.get("subject") or ""), "body": str(email.get("body") or "")},
    }


class MeetingService:
    def __init__(self, db: Database, router: ProviderRouter):
        self.db = db
        self.router = router
        self.active_id: str | None = None

    async def start(self, title: str = "") -> dict:
        if self.active_id:
            return await self.get(self.active_id)  # type: ignore[return-value]
        meeting_id = uuid.uuid4().hex[:12]
        await self.db.execute(
            "INSERT INTO meetings(id, title, started_at) VALUES (?,?,?)", (meeting_id, title or "Meeting", now())
        )
        self.active_id = meeting_id
        return {"id": meeting_id, "title": title or "Meeting", "active": True}

    async def add_line(self, speaker: str, text: str) -> None:
        if self.active_id:
            await self.db.execute(
                "INSERT INTO meeting_lines(meeting_id, speaker, text, ts) VALUES (?,?,?,?)",
                (self.active_id, speaker, text, now()),
            )

    async def _lines(self, meeting_id: str) -> list[dict]:
        return await self.db.fetchall(
            "SELECT speaker, text, ts FROM meeting_lines WHERE meeting_id = ? ORDER BY id", (meeting_id,)
        )

    async def stop(self, meeting_id: str | None = None) -> dict:
        meeting_id = meeting_id or self.active_id
        if not meeting_id:
            raise ValueError("No meeting is running.")
        if meeting_id == self.active_id:
            self.active_id = None
        await self.db.execute("UPDATE meetings SET ended_at = ? WHERE id = ?", (now(), meeting_id))
        return await self.summarize(meeting_id)

    async def summarize(self, meeting_id: str) -> dict:
        lines = await self._lines(meeting_id)
        if not lines:
            raise ValueError("Nothing was transcribed in this meeting, so there's nothing to summarize.")
        formatted = [f"{'Me' if ln['speaker'] == 'me' else 'Them'}: {ln['text']}" for ln in lines]
        chunks = split_transcript(formatted)
        if len(chunks) == 1:
            material = "Transcript:\n" + chunks[0]
        else:  # map-reduce for long meetings
            partials = []
            for i, chunk in enumerate(chunks, 1):
                text, _ = await self.router.complete(
                    [{"role": "user", "content": prompts.MEETING_CHUNK.format(transcript=chunk)}],
                    purpose="meeting_chunk",
                    temperature=0.2,
                    max_tokens=700,
                )
                partials.append(f"Part {i}:\n{text}")
            material = "Partial summaries in order:\n\n" + "\n\n".join(partials)
        text, _ = await self.router.complete(
            [{"role": "user", "content": prompts.MEETING_SUMMARY.format(material=material)}],
            purpose="meeting_summary",
            temperature=0.2,
            max_tokens=2000,
        )
        summary = normalize_summary(extract_json(text))
        await self.db.execute(
            "UPDATE meetings SET summary_json = ?, title = CASE WHEN ? != '' THEN ? ELSE title END WHERE id = ?",
            (json.dumps(summary), summary["title"], summary["title"], meeting_id),
        )
        return await self.get(meeting_id)  # type: ignore[return-value]

    async def get(self, meeting_id: str) -> dict | None:
        row = await self.db.fetchone("SELECT * FROM meetings WHERE id = ?", (meeting_id,))
        if not row:
            return None
        row["summary"] = json.loads(row.pop("summary_json")) if row.get("summary_json") else None
        row["lines"] = await self._lines(meeting_id)
        row["active"] = meeting_id == self.active_id
        return row

    async def list(self) -> list[dict]:
        rows = await self.db.fetchall(
            "SELECT m.id, m.title, m.started_at, m.ended_at, m.summary_json IS NOT NULL AS has_summary,"
            " (SELECT COUNT(*) FROM meeting_lines l WHERE l.meeting_id = m.id) AS lines"
            " FROM meetings m ORDER BY m.started_at DESC"
        )
        for r in rows:
            r["has_summary"] = bool(r["has_summary"])
            r["active"] = r["id"] == self.active_id
        return rows

    async def delete(self, meeting_id: str) -> bool:
        if meeting_id == self.active_id:
            self.active_id = None
        return bool(await self.db.execute("DELETE FROM meetings WHERE id = ?", (meeting_id,)))

    async def export_markdown(self, meeting_id: str) -> str | None:
        m = await self.get(meeting_id)
        if not m:
            return None
        s = m["summary"] or {}
        out = [f"# {m['title']}", "", f"_{m['started_at'][:16].replace('T', ' ')} UTC_", ""]
        if s.get("summary"):
            out += ["## Summary", "", s["summary"], ""]
        for key, label in [
            ("key_points", "Key points"),
            ("decisions", "Decisions"),
            ("open_questions", "Open questions"),
        ]:
            if s.get(key):
                out += [f"## {label}", ""] + [f"- {x}" for x in s[key]] + [""]
        if s.get("action_items"):
            out += ["## Action items", ""]
            out += [
                f"- [ ] {a['task']}"
                + (f" — {a['owner']}" if a["owner"] else "")
                + (f" (due {a['due']})" if a["due"] else "")
                for a in s["action_items"]
            ]
            out.append("")
        if s.get("follow_up_email", {}).get("body"):
            out += [
                "## Follow-up email",
                "",
                f"**Subject:** {s['follow_up_email']['subject']}",
                "",
                s["follow_up_email"]["body"],
                "",
            ]
        out += ["## Transcript", ""] + [
            f"**{'Me' if ln['speaker'] == 'me' else 'Them'}:** {ln['text']}" for ln in m["lines"]
        ]
        return "\n".join(out)
